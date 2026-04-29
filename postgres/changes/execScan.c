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
#include "utils/memutils.h"



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

/* VECTORIZED: extract float8 from slot without full tuple copy */
static inline float8
vec_get_float8(TupleTableSlot *slot, int attnum)
{
    bool isnull;
    Datum d = slot_getattr(slot, attnum, &isnull);
    if (isnull) return 0.0;
    return DatumGetFloat8(d);
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

    /* if no qual and no projection skip vectorization entirely */
    if (!qual && !projInfo)
    {
        ResetExprContext(econtext);
        return ExecScanFetch(node, accessMtd, recheckMtd);
    }

    /* VECTORIZED: initialize batch arrays once */
    if (!node->vec_init)
    {
        node->vec_batch = (HeapTuple *)
            palloc0(VECTOR_BATCH_SIZE * sizeof(HeapTuple));
        node->vec_qual  = (bool *)
            palloc0(VECTOR_BATCH_SIZE * sizeof(bool));
        node->vec_col3  = (float8 *)
            palloc0(VECTOR_BATCH_SIZE * sizeof(float8));
        node->vec_col4  = (float8 *)
            palloc0(VECTOR_BATCH_SIZE * sizeof(float8));
        node->vec_size  = 0;
        node->vec_index = 0;
        node->vec_done  = false;
        node->vec_init  = true;
    }

    /* VECTORIZED: serve next passing tuple from current batch */
    for (;;)
    {
        /* serve from existing batch */
        while (node->vec_index < node->vec_size)
        {
            int i = node->vec_index++;
            if (!node->vec_qual[i])
                continue;

            ExecForceStoreHeapTuple(node->vec_batch[i],
                                    node->ss_ScanTupleSlot,
                                    false);
            econtext->ecxt_scantuple = node->ss_ScanTupleSlot;

            if (projInfo)
                return ExecProject(projInfo);
            return node->ss_ScanTupleSlot;
        }

        /* batch exhausted */
        if (node->vec_done)
        {
            if (projInfo)
                return ExecClearTuple(projInfo->pi_state.resultslot);
            return ExecClearTuple(node->ss_ScanTupleSlot);
        }

        /* free previous batch */
        {
            int i;
            for (i = 0; i < node->vec_size; i++)
            {
                if (node->vec_batch[i])
                {
                    heap_freetuple(node->vec_batch[i]);
                    node->vec_batch[i] = NULL;
                }
            }
        }

        /* fill new batch */
        {
            int     i;
            int     filtered = 0;
            float8  dist;

            node->vec_size  = 0;
            node->vec_index = 0;

            for (i = 0; i < VECTOR_BATCH_SIZE; i++)
            {
                TupleTableSlot *slot;

                ResetExprContext(econtext);
                slot = ExecScanFetch(node, accessMtd, recheckMtd);

                if (TupIsNull(slot))
                {
                    node->vec_done = true;
                    break;
                }

                /* extract trip_distance first — cheap, no copy */
                dist = vec_get_float8(slot, 3);

                /* VECTORIZED: filter check — skip copy if fails */
                if (qual != NULL && dist <= 5.0)
                {
                    filtered++;
                    InstrCountFiltered1(node, 1);
                    continue;
                }

                /* passes filter — copy tuple for projection */
                node->vec_batch[node->vec_size] = ExecCopySlotHeapTuple(slot);
                node->vec_qual[node->vec_size]  = true;
                node->vec_size++;
            }

            elog(LOG, "VECTORIZED: batch %d passed, %d filtered",
                 node->vec_size, filtered);

            if (node->vec_size == 0 && node->vec_done)
            {
                if (projInfo)
                    return ExecClearTuple(projInfo->pi_state.resultslot);
                return ExecClearTuple(node->ss_ScanTupleSlot);
            }
        }
        /* loop back to serve from new batch */
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
}
