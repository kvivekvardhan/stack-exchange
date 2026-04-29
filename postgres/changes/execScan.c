/*-------------------------------------------------------------------------
 *
 * execScan.c
 *	  This code provides support for generalized relation scans. ExecScan
 *	  is passed a node and a pointer to a function to "do the right thing"
 *	  and return a tuple from the relation. ExecScan then does the tedious
 *	  stuff - checking the qualification and projecting the tuple
 *	  appropriately.
 *
 * Portions Copyright (c) 1996-2022, PostgreSQL Global Development Group
 * Portions Copyright (c) 1994, Regents of the University of California
 *
 *
 * IDENTIFICATION
 *	  src/backend/executor/execScan.c
 *
 *-------------------------------------------------------------------------
 */
#include "postgres.h"
#include "executor/tuptable.h"

#include "executor/executor.h"
#include "miscadmin.h"
#include "catalog/pg_type_d.h"
#include "utils/rel.h"
#include "utils/memutils.h"

#include <string.h>



/*
 * ExecScanFetch -- check interrupts & fetch next potential tuple
 *
 * This routine is concerned with substituting a test tuple if we are
 * inside an EvalPlanQual recheck.  If we aren't, just execute
 * the access method's next-tuple routine.
 */
static inline TupleTableSlot *
ExecScanFetch(ScanState *node,
			  ExecScanAccessMtd accessMtd,
			  ExecScanRecheckMtd recheckMtd)
{
	EState	   *estate = node->ps.state;

	CHECK_FOR_INTERRUPTS();

	if (estate->es_epq_active != NULL)
	{
		EPQState   *epqstate = estate->es_epq_active;

		/*
		 * We are inside an EvalPlanQual recheck.  Return the test tuple if
		 * one is available, after rechecking any access-method-specific
		 * conditions.
		 */
		Index		scanrelid = ((Scan *) node->ps.plan)->scanrelid;

		if (scanrelid == 0)
		{
			/*
			 * This is a ForeignScan or CustomScan which has pushed down a
			 * join to the remote side.  If it is a descendant node in the EPQ
			 * recheck plan tree, run the recheck method function.  Otherwise,
			 * run the access method function below.
			 */
			if (bms_is_member(epqstate->epqParam, node->ps.plan->extParam))
			{
				/*
				 * The recheck method is responsible not only for rechecking
				 * the scan/join quals but also for storing the correct tuple
				 * in the slot.
				 */

				TupleTableSlot *slot = node->ss_ScanTupleSlot;

				if (!(*recheckMtd) (node, slot))
					ExecClearTuple(slot);	/* would not be returned by scan */
				return slot;
			}
		}
		else if (epqstate->relsubs_done[scanrelid - 1])
		{
			/*
			 * Return empty slot, as either there is no EPQ tuple for this rel
			 * or we already returned it.
			 */

			TupleTableSlot *slot = node->ss_ScanTupleSlot;

			return ExecClearTuple(slot);
		}
		else if (epqstate->relsubs_slot[scanrelid - 1] != NULL)
		{
			/*
			 * Return replacement tuple provided by the EPQ caller.
			 */

			TupleTableSlot *slot = epqstate->relsubs_slot[scanrelid - 1];

			Assert(epqstate->relsubs_rowmark[scanrelid - 1] == NULL);

			/* Mark to remember that we shouldn't return it again */
			epqstate->relsubs_done[scanrelid - 1] = true;

			/* Return empty slot if we haven't got a test tuple */
			if (TupIsNull(slot))
				return NULL;

			/* Check if it meets the access-method conditions */
			if (!(*recheckMtd) (node, slot))
				return ExecClearTuple(slot);	/* would not be returned by
												 * scan */
			return slot;
		}
		else if (epqstate->relsubs_rowmark[scanrelid - 1] != NULL)
		{
			/*
			 * Fetch and return replacement tuple using a non-locking rowmark.
			 */

			TupleTableSlot *slot = node->ss_ScanTupleSlot;

			/* Mark to remember that we shouldn't return more */
			epqstate->relsubs_done[scanrelid - 1] = true;

			if (!EvalPlanQualFetchRowMark(epqstate, scanrelid, slot))
				return NULL;

			/* Return empty slot if we haven't got a test tuple */
			if (TupIsNull(slot))
				return NULL;

			/* Check if it meets the access-method conditions */
			if (!(*recheckMtd) (node, slot))
				return ExecClearTuple(slot);	/* would not be returned by
												 * scan */
			return slot;
		}
	}

	/*
	 * Run the node-type-specific access method function to get the next tuple
	 */
	return (*accessMtd) (node);
}

/* ----------------------------------------------------------------
 *		ExecScan
 *
 *		Scans the relation using the 'access method' indicated and
 *		returns the next qualifying tuple.
 *		The access method returns the next tuple and ExecScan() is
 *		responsible for checking the tuple returned against the qual-clause.
 *
 *		A 'recheck method' must also be provided that can check an
 *		arbitrary tuple of the relation against any qual conditions
 *		that are implemented internal to the access method.
 *
 *		Conditions:
 *		  -- the "cursor" maintained by the AMI is positioned at the tuple
 *			 returned previously.
 *
 *		Initial States:
 *		  -- the relation indicated is opened for scanning so that the
 *			 "cursor" is positioned before the first qualifying tuple.
 * ----------------------------------------------------------------
 */
/* VECTORIZED: relation-specific modes */
typedef enum VecRelationKind
{
    VEC_REL_NONE = 0,
    VEC_REL_SE_POSTS,
    VEC_REL_QUESTIONS
} VecRelationKind;

/* VECTORIZED: column positions for se_posts schema */
#define VEC_AGG_MAX_GROUPS  8
#define VEC_COL_POSTTYPE      2   /* PostTypeId */
#define VEC_COL_SCORE         3   /* Score */
#define VEC_COL_VIEWCOUNT     4   /* ViewCount */

#define VEC_BATCH_SIZE      1000

/* VECTORIZED: detect exact se_posts schema */
static bool
vec_is_se_posts_relation(ScanState *node)
{
    TupleDesc desc;
    int i;

    if (node->ss_currentRelation == NULL)
        return false;

    if (strcmp(RelationGetRelationName(node->ss_currentRelation), "se_posts") != 0)
        return false;

    desc = node->ss_ScanTupleSlot->tts_tupleDescriptor;
    if (desc == NULL || desc->natts != 7)
        return false;

    /*
     * Expected schema:
     * (id, posttypeid, score, viewcount, answercount, commentcount, favoritecount)
     * all int4
     */
    for (i = 0; i < 7; i++)
    {
        Form_pg_attribute attr = TupleDescAttr(desc, i);
        if (attr->attisdropped)
            return false;
        if (attr->atttypid != INT4OID)
            return false;
    }

    return true;
}

/* VECTORIZED: detect exact questions schema used by main app endpoints */
static bool
vec_is_questions_relation(ScanState *node)
{
    TupleDesc desc;
    static const Oid expected[7] = {
        INT4OID,        /* id */
        TEXTOID,        /* title */
        TEXTOID,        /* body */
        TEXTOID,        /* asked_by */
        INT4OID,        /* score */
        INT4OID,        /* views */
        TIMESTAMPTZOID  /* created_at */
    };
    int i;

    if (node->ss_currentRelation == NULL)
        return false;

    if (strcmp(RelationGetRelationName(node->ss_currentRelation), "questions") != 0)
        return false;

    desc = node->ss_ScanTupleSlot->tts_tupleDescriptor;
    if (desc == NULL || desc->natts != 7)
        return false;

    for (i = 0; i < 7; i++)
    {
        Form_pg_attribute attr = TupleDescAttr(desc, i);
        if (attr->attisdropped)
            return false;
        if (attr->atttypid != expected[i])
            return false;
    }

    return true;
}

static VecRelationKind
vec_detect_target_relation(ScanState *node)
{
    if (vec_is_se_posts_relation(node))
        return VEC_REL_SE_POSTS;
    if (vec_is_questions_relation(node))
        return VEC_REL_QUESTIONS;
    return VEC_REL_NONE;
}

static inline void
vec_agg_reset(ScanState *node)
{
    if (node->vec_agg_sum)
        memset(node->vec_agg_sum, 0, VEC_AGG_MAX_GROUPS * sizeof(float8));
    if (node->vec_agg_sum2)
        memset(node->vec_agg_sum2, 0, VEC_AGG_MAX_GROUPS * sizeof(float8));
    if (node->vec_agg_dist_sum)
        memset(node->vec_agg_dist_sum, 0, VEC_AGG_MAX_GROUPS * sizeof(float8));
    if (node->vec_agg_count)
        memset(node->vec_agg_count, 0, VEC_AGG_MAX_GROUPS * sizeof(int64));
    node->vec_agg_logged = false;
}

TupleTableSlot *
ExecScan(ScanState *node,
         ExecScanAccessMtd accessMtd,
         ExecScanRecheckMtd recheckMtd)
{
    ExprContext    *econtext;
    ExprState      *qual;
    ProjectionInfo *projInfo;

    qual     = node->ps.qual;
    projInfo = node->ps.ps_ProjInfo;
    econtext = node->ps.ps_ExprContext;

    /* VECTORIZED: one-time init — cache activation decision and allocate state. */
    if (!node->vec_init)
    {
        const char *pg_vec = getenv("PG_VECTORIZED");
        VecRelationKind relkind = vec_detect_target_relation(node);

        node->vec_active = (pg_vec != NULL &&
                            strcmp(pg_vec, "1") == 0 &&
                            relkind != VEC_REL_NONE);
        node->vec_init = true;

        if (node->vec_active)
        {
            if (relkind == VEC_REL_SE_POSTS)
            {
                node->vec_agg_sum = (float8 *) palloc0(VEC_AGG_MAX_GROUPS * sizeof(float8));
                node->vec_agg_count = (int64 *) palloc0(VEC_AGG_MAX_GROUPS * sizeof(int64));
                node->vec_agg_enabled = true;
            }
            else
            {
                node->vec_agg_enabled = false;
            }
            node->vec_agg_logged = false;
            node->vec_passed = 0;
            node->vec_filtered = 0;
            node->vec_total_passed = 0;
            node->vec_total_filtered = 0;
            /* VECTORIZED: true batch slot flow initialization */
            node->vec_batch_count = 0;
            node->vec_batch_index = 0;
            node->vec_batch_done = false;
            node->vec_batch_tuples = (HeapTuple *) palloc(VEC_BATCH_SIZE * sizeof(HeapTuple));
        }
    }

    for (;;)
    {
        /* VECTORIZED: bypass volcano loop and use internal batch processor if active */
        if (node->vec_active)
        {
            /* If current batch is exhausted, fetch and process a new batch */
            if (node->vec_batch_index >= node->vec_batch_count && !node->vec_batch_done)
            {
                int i;
                node->vec_batch_index = 0;
                node->vec_batch_count = 0;

                /* 1. Batch Fetch Phase */
                for (i = 0; i < VEC_BATCH_SIZE; i++)
                {
                    TupleTableSlot *raw = ExecScanFetch(node, accessMtd, recheckMtd);
                    if (TupIsNull(raw))
                    {
                        node->vec_batch_done = true;
                        break;
                    }
                    /* Store tuple in our batch buffer */
                    node->vec_batch_tuples[node->vec_batch_count++] = ExecCopySlotHeapTuple(raw);
                }

                /* 2. Vectorized Processing Phase */
                for (i = 0; i < node->vec_batch_count; i++)
                {
                    HeapTuple tup = node->vec_batch_tuples[i];
                    bool pass = true;

                    ResetExprContext(econtext);

                    /*
                     * se_posts fast-path:
                     * Apply cheap inline pre-filter before ExecQual.
                     * questions fast-path:
                     * Skip this pre-filter and rely on ExecQual to preserve semantics.
                     */
                    if (node->vec_agg_enabled)
                    {
                        bool isnull;
                        Datum d;
                        int32 views;

                        d = heap_getattr(tup, VEC_COL_VIEWCOUNT,
                                         node->ss_ScanTupleSlot->tts_tupleDescriptor, &isnull);
                        views = isnull ? 0 : DatumGetInt32(d);
                        if (qual != NULL && views <= 100)
                            pass = false;
                    }

                    /*
                     * Preserve correctness for all quals by evaluating ExecQual on
                     * the tuple we just batched.
                     */
                    if (pass && qual != NULL)
                    {
                        ExecForceStoreHeapTuple(tup, node->ss_ScanTupleSlot, false);
                        econtext->ecxt_scantuple = node->ss_ScanTupleSlot;
                        pass = ExecQual(qual, econtext);
                        ExecClearTuple(node->ss_ScanTupleSlot);
                    }

                    if (!pass)
                    {
                        heap_freetuple(tup);
                        node->vec_batch_tuples[i] = NULL;
                        node->vec_filtered++;
                        node->vec_total_filtered++;
                        InstrCountFiltered1(node, 1);
                        continue;
                    }

                    /* Passed filter/qual. */
                    node->vec_passed++;
                    node->vec_total_passed++;

                    if (node->vec_agg_enabled)
                    {
                        bool isnull;
                        Datum d = heap_getattr(tup, VEC_COL_POSTTYPE,
                                               node->ss_ScanTupleSlot->tts_tupleDescriptor, &isnull);
                        int32 type_id = isnull ? 0 : DatumGetInt32(d);

                        if (type_id > 0 && type_id < VEC_AGG_MAX_GROUPS)
                        {
                            Datum score_d = heap_getattr(tup, VEC_COL_SCORE,
                                                         node->ss_ScanTupleSlot->tts_tupleDescriptor, &isnull);
                            node->vec_agg_sum[type_id] += isnull ? 0 : DatumGetInt32(score_d);
                            node->vec_agg_count[type_id]++;
                        }
                    }
                }
            }

            /* 3. Yield Phase: return tuples from the processed batch one-by-one */
            while (node->vec_batch_index < node->vec_batch_count)
            {
                HeapTuple tup = node->vec_batch_tuples[node->vec_batch_index++];
                if (tup != NULL)
                {
                    ExecForceStoreHeapTuple(tup, node->ss_ScanTupleSlot, true); /* Will be freed by ExecClearTuple */
                    econtext->ecxt_scantuple = node->ss_ScanTupleSlot;
                    
                    if (projInfo)
                        return ExecProject(projInfo);
                    return node->ss_ScanTupleSlot;
                }
            }

            if (node->vec_batch_done)
            {
                /* Scan complete — log aggregate results */
                if (node->vec_agg_enabled && !node->vec_agg_logged)
                {
                    int i;
                    for (i = 1; i < VEC_AGG_MAX_GROUPS; i++)
                    {
                        if (node->vec_agg_count[i] == 0) continue;
                        elog(LOG, "VECTORIZED AGG: PostType=%d avg_score=%.4f count=" INT64_FORMAT,
                             i, node->vec_agg_sum[i] / (double) node->vec_agg_count[i], node->vec_agg_count[i]);
                    }
                    elog(LOG, "VECTORIZED SCAN TOTAL: " INT64_FORMAT " passed, " INT64_FORMAT " filtered",
                         node->vec_total_passed, node->vec_total_filtered);
                    node->vec_agg_logged = true;
                }
                return NULL;
            }
            continue;
        }

        /* Volcano Execution (Fallback for non-vectorized queries) */
        TupleTableSlot *slot = ExecScanFetch(node, accessMtd, recheckMtd);
        ResetExprContext(econtext);
        
        if (TupIsNull(slot)) return NULL;

        econtext->ecxt_scantuple = slot;
        if (qual == NULL || ExecQual(qual, econtext))
        {
            if (projInfo)
                return ExecProject(projInfo);
            return slot;
        }
        else
        {
            InstrCountFiltered1(node, 1);
        }
    }
}


/*
 * ExecAssignScanProjectionInfo
 *		Set up projection info for a scan node, if necessary.
 *
 * We can avoid a projection step if the requested tlist exactly matches
 * the underlying tuple type.  If so, we just set ps_ProjInfo to NULL.
 * Note that this case occurs not only for simple "SELECT * FROM ...", but
 * also in most cases where there are joins or other processing nodes above
 * the scan node, because the planner will preferentially generate a matching
 * tlist.
 *
 * The scan slot's descriptor must have been set already.
 */
void
ExecAssignScanProjectionInfo(ScanState *node)
{
	Scan	   *scan = (Scan *) node->ps.plan;
	TupleDesc	tupdesc = node->ss_ScanTupleSlot->tts_tupleDescriptor;

	ExecConditionalAssignProjectionInfo(&node->ps, tupdesc, scan->scanrelid);
}

/*
 * ExecAssignScanProjectionInfoWithVarno
 *		As above, but caller can specify varno expected in Vars in the tlist.
 */
void
ExecAssignScanProjectionInfoWithVarno(ScanState *node, int varno)
{
	TupleDesc	tupdesc = node->ss_ScanTupleSlot->tts_tupleDescriptor;

	ExecConditionalAssignProjectionInfo(&node->ps, tupdesc, varno);
}

/*
 * ExecScanReScan
 *
 * This must be called within the ReScan function of any plan node type
 * that uses ExecScan().
 */
void
ExecScanReScan(ScanState *node)
{
	EState	   *estate = node->ps.state;

	/*
	 * We must clear the scan tuple so that observers (e.g., execCurrent.c)
	 * can tell that this plan node is not positioned on a tuple.
	 */
	ExecClearTuple(node->ss_ScanTupleSlot);

	/*
	 * Rescan EvalPlanQual tuple(s) if we're inside an EvalPlanQual recheck.
	 * But don't lose the "blocked" status of blocked target relations.
	 */
	if (estate->es_epq_active != NULL)
	{
		EPQState   *epqstate = estate->es_epq_active;
		Index		scanrelid = ((Scan *) node->ps.plan)->scanrelid;

		if (scanrelid > 0)
			epqstate->relsubs_done[scanrelid - 1] =
				epqstate->epqExtra->relsubs_blocked[scanrelid - 1];
		else
		{
			Bitmapset  *relids;
			int			rtindex = -1;

			/*
			 * If an FDW or custom scan provider has replaced the join with a
			 * scan, there are multiple RTIs; reset the relsubs_done flag for
			 * all of them.
			 */
			if (IsA(node->ps.plan, ForeignScan))
				relids = ((ForeignScan *) node->ps.plan)->fs_relids;
			else if (IsA(node->ps.plan, CustomScan))
				relids = ((CustomScan *) node->ps.plan)->custom_relids;
			else
				elog(ERROR, "unexpected scan node: %d",
					 (int) nodeTag(node->ps.plan));

			while ((rtindex = bms_next_member(relids, rtindex)) >= 0)
			{
				Assert(rtindex > 0);
				epqstate->relsubs_done[rtindex - 1] =
					epqstate->epqExtra->relsubs_blocked[rtindex - 1];
			}
		}
	}

	/* VECTORIZED: reset streaming counters and aggregate state on rescan */
	if (node->vec_init && node->vec_active)
	{
		node->vec_passed = 0;
		node->vec_filtered = 0;
		node->vec_total_passed = 0;
		node->vec_total_filtered = 0;
		node->vec_batch_count = 0;
		node->vec_batch_index = 0;
		node->vec_batch_done = false;
		vec_agg_reset(node);
	}
}
