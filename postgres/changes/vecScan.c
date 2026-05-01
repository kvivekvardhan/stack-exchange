/*-------------------------------------------------------------------------
 *
 * vecScan.c
 *	  Experimental CustomScan executor for vectorized sequential scans.
 *
 * This file is intentionally side-by-side with the current executor patch.
 * Phase 1 preserves the existing ExecScan/nodeAgg implementation while this
 * CustomScan path is compiled and tested independently.
 *
 *-------------------------------------------------------------------------
 */
#include "postgres.h"

#include "access/relscan.h"
#include "access/tableam.h"
#include "executor/executor.h"
#include "miscadmin.h"
#include "nodes/extensible.h"
#include "nodes/makefuncs.h"
#include "optimizer/cost.h"
#include "optimizer/plancat.h"
#include "optimizer/restrictinfo.h"
#include "utils/lsyscache.h"
#include "utils/rel.h"

typedef struct VecScanState
{
	CustomScanState css;
	TableScanDesc scandesc;
	TupleTableSlot *scan_slot;
	TupleTableSlot *result_slot;
	HeapTuple  *batch_tuples;
	int			batch_count;
	int			batch_index;
	bool		batch_done;
	int64		total_passed;
	int64		total_filtered;
} VecScanState;

static void VecBeginCustomScan(CustomScanState *node, EState *estate, int eflags);
static TupleTableSlot *VecExecCustomScan(CustomScanState *node);
static void VecEndCustomScan(CustomScanState *node);
static void VecReScanCustomScan(CustomScanState *node);
static void VecExplainCustomScan(CustomScanState *node, List *ancestors, ExplainState *es);
static Node *VecCreateCustomScanState(CustomScan *cscan);
static Plan *VecPlanCustomPath(PlannerInfo *root, RelOptInfo *rel,
							   CustomPath *best_path, List *tlist,
							   List *clauses, List *custom_plans);
static void VecClearBatch(VecScanState *vstate);
static TupleTableSlot *VecStoreVirtualScanTuple(TupleTableSlot *src,
												TupleTableSlot *dst);

#ifndef VEC_BATCH_SIZE
#define VEC_BATCH_SIZE 1000
#endif

void VecRegisterCustomScan(void);

static CustomExecMethods VecCustomExecMethods = {
	.CustomName = "Vectorized Seq Scan",
	.BeginCustomScan = VecBeginCustomScan,
	.ExecCustomScan = VecExecCustomScan,
	.EndCustomScan = VecEndCustomScan,
	.ReScanCustomScan = VecReScanCustomScan,
	.MarkPosCustomScan = NULL,
	.RestrPosCustomScan = NULL,
	.EstimateDSMCustomScan = NULL,
	.InitializeDSMCustomScan = NULL,
	.ReInitializeDSMCustomScan = NULL,
	.InitializeWorkerCustomScan = NULL,
	.ShutdownCustomScan = NULL,
	.ExplainCustomScan = VecExplainCustomScan
};

static CustomScanMethods VecCustomScanMethods = {
	.CustomName = "Vectorized Seq Scan",
	.CreateCustomScanState = VecCreateCustomScanState
};

CustomPathMethods VecCustomPathMethods = {
	.CustomName = "Vectorized Seq Scan",
	.PlanCustomPath = VecPlanCustomPath,
	.ReparameterizeCustomPathByChild = NULL
};

void
VecRegisterCustomScan(void)
{
	RegisterCustomScanMethods(&VecCustomScanMethods);
}

static Node *
VecCreateCustomScanState(CustomScan *cscan)
{
	VecScanState *vstate = palloc0(sizeof(VecScanState));

	NodeSetTag(&vstate->css, T_CustomScanState);
	vstate->css.methods = &VecCustomExecMethods;
	return (Node *) vstate;
}

static Plan *
VecPlanCustomPath(PlannerInfo *root, RelOptInfo *rel,
				  CustomPath *best_path, List *tlist,
				  List *clauses, List *custom_plans)
{
	CustomScan *cscan = makeNode(CustomScan);

	cscan->scan.plan.targetlist = tlist;
	cscan->scan.plan.qual = extract_actual_clauses(clauses, false);
	cscan->scan.scanrelid = rel->relid;
	cscan->flags = best_path->flags;
	cscan->custom_plans = custom_plans;
	cscan->custom_exprs = NIL;
	cscan->custom_private = best_path->custom_private;
	cscan->custom_scan_tlist = build_physical_tlist(root, rel);
	cscan->custom_relids = bms_make_singleton(rel->relid);
	cscan->methods = &VecCustomScanMethods;

	return &cscan->scan.plan;
}

static void
VecBeginCustomScan(CustomScanState *node, EState *estate, int eflags)
{
	VecScanState *vstate = (VecScanState *) node;

	vstate->scandesc = NULL;
	vstate->scan_slot = ExecInitExtraTupleSlot(estate,
											  RelationGetDescr(node->ss.ss_currentRelation),
											  table_slot_callbacks(node->ss.ss_currentRelation));
	vstate->result_slot = MakeSingleTupleTableSlot(RelationGetDescr(node->ss.ss_currentRelation),
												  &TTSOpsHeapTuple);
	vstate->batch_tuples = (HeapTuple *) palloc0(VEC_BATCH_SIZE * sizeof(HeapTuple));
	vstate->batch_count = 0;
	vstate->batch_index = 0;
	vstate->batch_done = false;
	vstate->total_passed = 0;
	vstate->total_filtered = 0;
}

static void
VecClearBatch(VecScanState *vstate)
{
	int			i;

	if (vstate->result_slot != NULL)
		ExecClearTuple(vstate->result_slot);

	for (i = 0; i < vstate->batch_count; i++)
	{
		if (vstate->batch_tuples[i] != NULL)
		{
			heap_freetuple(vstate->batch_tuples[i]);
			vstate->batch_tuples[i] = NULL;
		}
	}

	vstate->batch_count = 0;
	vstate->batch_index = 0;
}

static TupleTableSlot *
VecStoreVirtualScanTuple(TupleTableSlot *src, TupleTableSlot *dst)
{
	int			natts = dst->tts_tupleDescriptor->natts;

	slot_getsomeattrs(src, natts);
	ExecClearTuple(dst);
	memcpy(dst->tts_values, src->tts_values, natts * sizeof(Datum));
	memcpy(dst->tts_isnull, src->tts_isnull, natts * sizeof(bool));
	ExecStoreVirtualTuple(dst);

	return dst;
}

static void
VecFillBatch(VecScanState *vstate)
{
	CustomScanState *node = &vstate->css;
	EState	   *estate = node->ss.ps.state;
	ExprContext *econtext = node->ss.ps.ps_ExprContext;
	ExprState  *qual = node->ss.ps.qual;
	TupleTableSlot *slot = vstate->scan_slot;
	TupleTableSlot *expr_slot = node->ss.ss_ScanTupleSlot;
	ScanDirection direction = estate->es_direction;
	int			i;

	VecClearBatch(vstate);

	if (vstate->scandesc == NULL)
		vstate->scandesc = table_beginscan(node->ss.ss_currentRelation,
										   estate->es_snapshot,
										   0, NULL);

	for (i = 0; i < VEC_BATCH_SIZE; i++)
	{
		bool		pass = true;

		if (!table_scan_getnextslot(vstate->scandesc, direction, slot))
		{
			vstate->batch_done = true;
			break;
		}

		ResetExprContext(econtext);
		VecStoreVirtualScanTuple(slot, expr_slot);
		econtext->ecxt_scantuple = expr_slot;

		if (qual != NULL)
			pass = ExecQual(qual, econtext);

		if (!pass)
		{
			vstate->total_filtered++;
			InstrCountFiltered1(&node->ss, 1);
			ExecClearTuple(slot);
			continue;
		}

		vstate->batch_tuples[vstate->batch_count++] = ExecCopySlotHeapTuple(slot);
		vstate->total_passed++;
		ExecClearTuple(slot);
	}
}

static TupleTableSlot *
VecExecCustomScan(CustomScanState *node)
{
	VecScanState *vstate = (VecScanState *) node;
	ProjectionInfo *projInfo = node->ss.ps.ps_ProjInfo;
	ExprContext *econtext = node->ss.ps.ps_ExprContext;

	for (;;)
	{
		if (vstate->batch_index >= vstate->batch_count && !vstate->batch_done)
			VecFillBatch(vstate);

		while (vstate->batch_index < vstate->batch_count)
		{
			HeapTuple	tup = vstate->batch_tuples[vstate->batch_index++];

			if (tup == NULL)
				continue;

			ExecForceStoreHeapTuple(tup, vstate->result_slot, false);
			slot_getallattrs(vstate->result_slot);
			econtext->ecxt_scantuple = vstate->result_slot;

			if (projInfo != NULL)
			{
				projInfo->pi_exprContext->ecxt_scantuple = vstate->result_slot;
				return ExecProject(projInfo);
			}

			return vstate->result_slot;
		}

		if (vstate->batch_done)
		{
			VecClearBatch(vstate);
			return NULL;
		}
	}
}

static void
VecEndCustomScan(CustomScanState *node)
{
	VecScanState *vstate = (VecScanState *) node;

	if (vstate->scandesc != NULL)
		table_endscan(vstate->scandesc);

	VecClearBatch(vstate);

	if (vstate->result_slot != NULL)
		ExecDropSingleTupleTableSlot(vstate->result_slot);

	elog(DEBUG1,
		 "Vectorized CustomScan complete: " INT64_FORMAT " passed, " INT64_FORMAT " filtered",
		 vstate->total_passed,
		 vstate->total_filtered);
}

static void
VecReScanCustomScan(CustomScanState *node)
{
	VecScanState *vstate = (VecScanState *) node;

	if (vstate->scandesc != NULL)
		table_rescan(vstate->scandesc, NULL);

	VecClearBatch(vstate);
	vstate->batch_done = false;
	vstate->total_passed = 0;
	vstate->total_filtered = 0;
}

static void
VecExplainCustomScan(CustomScanState *node, List *ancestors, ExplainState *es)
{
	ExplainPropertyInteger("Batch Size", NULL, VEC_BATCH_SIZE, es);
}
