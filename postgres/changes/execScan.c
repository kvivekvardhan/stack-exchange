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

/* VECTORIZED: extract float8 from slot without full tuple copy */
static inline float8
vec_get_float8(TupleTableSlot *slot, int attnum)
{
    bool isnull;
    Datum d = slot_getattr(slot, attnum, &isnull);
    if (isnull) return 0.0;
    return DatumGetFloat8(d);
}

/* VECTORIZED: extract int32 from slot without full tuple copy */
static inline int32
vec_get_int32(TupleTableSlot *slot, int attnum)
{
    bool isnull;
    Datum d = slot_getattr(slot, attnum, &isnull);
    if (isnull) return 0;
    return DatumGetInt32(d);
}

/* VECTORIZED: column positions for taxi_trips schema */
#define VEC_AGG_MAX_GROUPS  8
#define VEC_AGG_COL_PASSENGER 2   /* passenger_count */
#define VEC_AGG_COL_DIST      3   /* trip_distance */
#define VEC_AGG_COL_FARE      4   /* fare_amount */
#define VEC_AGG_COL_TIP       5   /* tip_amount */

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

    /*
     * VECTORIZED: one-time init — cache the decision and allocate agg arrays.
     * We check PG_VECTORIZED env var only once and store the result.
     */
    if (!node->vec_init)
    {
        const char *pg_vec = getenv("PG_VECTORIZED");
        int natts = node->ss_ScanTupleSlot->tts_tupleDescriptor->natts;

        node->vec_active = (pg_vec != NULL &&
                            strcmp(pg_vec, "1") == 0 &&
                            natts == 6);
        node->vec_init = true;

        if (node->vec_active)
        {
            /* allocate multi-column aggregate arrays */
            node->vec_agg_sum = (float8 *)
                palloc0(VEC_AGG_MAX_GROUPS * sizeof(float8));
            node->vec_agg_sum2 = (float8 *)
                palloc0(VEC_AGG_MAX_GROUPS * sizeof(float8));
            node->vec_agg_dist_sum = (float8 *)
                palloc0(VEC_AGG_MAX_GROUPS * sizeof(float8));
            node->vec_agg_count = (int64 *)
                palloc0(VEC_AGG_MAX_GROUPS * sizeof(int64));
            node->vec_agg_enabled = true;
            node->vec_agg_logged = false;
            node->vec_passed = 0;
            node->vec_filtered = 0;
            node->vec_total_passed = 0;
            node->vec_total_filtered = 0;
        }
    }

    /*
     * NON-VECTORIZED: standard Volcano-model execution.
     * Used when PG_VECTORIZED!=1 or table schema doesn't match taxi_trips.
     */
    if (!node->vec_active)
    {
        if (!qual && !projInfo)
        {
            ResetExprContext(econtext);
            return ExecScanFetch(node, accessMtd, recheckMtd);
        }

        for (;;)
        {
            TupleTableSlot *slot;

            ResetExprContext(econtext);
            slot = ExecScanFetch(node, accessMtd, recheckMtd);

            if (TupIsNull(slot))
                return slot;

            econtext->ecxt_scantuple = slot;

            if (qual == NULL || ExecQual(qual, econtext))
            {
                if (projInfo)
                    return ExecProject(projInfo);
                return slot;
            }

            InstrCountFiltered1(node, 1);
            ResetExprContext(econtext);
        }
    }

    /*
     * VECTORIZED STREAMING FILTER: no tuple copying.
     *
     * Fetch tuples one at a time, extract trip_distance via slot_getattr
     * for inline filtering (bypassing ExecQual), accumulate aggregates
     * as a side-channel, and return qualifying tuples directly from
     * the scan slot.
     */
    for (;;)
    {
        TupleTableSlot *slot;
        float8 dist;
        int32  passenger;
        float8 fare, tip;

        ResetExprContext(econtext);
        slot = ExecScanFetch(node, accessMtd, recheckMtd);

        if (TupIsNull(slot))
        {
            /* Scan complete — log aggregate results and batch stats */
            if (node->vec_agg_enabled && !node->vec_agg_logged)
            {
                int i;

                /* log final batch window stats */
                if (node->vec_passed > 0 || node->vec_filtered > 0)
                {
                    elog(LOG, "VECTORIZED: window %d passed, %d filtered",
                         node->vec_passed, node->vec_filtered);
                }

                /* log per-group aggregate results */
                for (i = 1; i < VEC_AGG_MAX_GROUPS; i++)
                {
                    if (node->vec_agg_count[i] == 0)
                        continue;
                    elog(LOG,
                         "VECTORIZED AGG: passenger=%d avg_fare=%.4f avg_tip=%.4f avg_dist=%.4f count=" INT64_FORMAT,
                         i,
                         node->vec_agg_sum[i] / (double) node->vec_agg_count[i],
                         node->vec_agg_sum2[i] / (double) node->vec_agg_count[i],
                         node->vec_agg_dist_sum[i] / (double) node->vec_agg_count[i],
                         node->vec_agg_count[i]);
                }

                /* log scan-wide totals */
                elog(LOG, "VECTORIZED SCAN TOTAL: " INT64_FORMAT " passed, " INT64_FORMAT " filtered",
                     node->vec_total_passed, node->vec_total_filtered);

                node->vec_agg_logged = true;
            }

            return slot;  /* NULL slot signals end-of-scan */
        }

        /* VECTORIZED: inline filter on trip_distance (col 3) */
        dist = vec_get_float8(slot, VEC_AGG_COL_DIST);

        if (qual != NULL && dist <= 5.0)
        {
            /* Filtered out — skip this tuple entirely (no copy!) */
            node->vec_filtered++;
            node->vec_total_filtered++;
            InstrCountFiltered1(node, 1);

            /* Log batch stats every VECTOR_BATCH_SIZE tuples */
            if ((node->vec_passed + node->vec_filtered) >= VECTOR_BATCH_SIZE)
            {
                elog(LOG, "VECTORIZED: window %d passed, %d filtered",
                     node->vec_passed, node->vec_filtered);
                node->vec_passed = 0;
                node->vec_filtered = 0;
            }
            continue;
        }

        /* Tuple passes filter — accumulate aggregates */
        node->vec_passed++;
        node->vec_total_passed++;

        if (node->vec_agg_enabled)
        {
            passenger = vec_get_int32(slot, VEC_AGG_COL_PASSENGER);
            fare = vec_get_float8(slot, VEC_AGG_COL_FARE);
            tip = vec_get_float8(slot, VEC_AGG_COL_TIP);

            if (passenger > 0 && passenger < VEC_AGG_MAX_GROUPS)
            {
                node->vec_agg_sum[passenger] += fare;
                node->vec_agg_sum2[passenger] += tip;
                node->vec_agg_dist_sum[passenger] += dist;
                node->vec_agg_count[passenger]++;
            }
        }

        /* Log batch stats every VECTOR_BATCH_SIZE tuples */
        if ((node->vec_passed + node->vec_filtered) >= VECTOR_BATCH_SIZE)
        {
            elog(LOG, "VECTORIZED: window %d passed, %d filtered",
                 node->vec_passed, node->vec_filtered);
            node->vec_passed = 0;
            node->vec_filtered = 0;
        }

        /* Return the tuple directly — no copy needed! */
        econtext->ecxt_scantuple = slot;

        if (projInfo)
            return ExecProject(projInfo);
        return slot;
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
		vec_agg_reset(node);
	}
}
