/*-------------------------------------------------------------------------
 *
 * vecScan.h
 *	  Shared VecScanState definition used by vecScan.c and nodeAgg.c.
 *
 *-------------------------------------------------------------------------
 */
#ifndef VECSCAN_H
#define VECSCAN_H

#include "postgres.h"
#include "nodes/extensible.h"
#include "access/relscan.h"
#include "executor/tuptable.h"

typedef struct VecScanState
{
	CustomScanState css;
	TableScanDesc	scandesc;
	TupleTableSlot *scan_slot;
	TupleTableSlot *result_slot;
	int				natts;			/* number of attributes in the relation */
	Datum		   *batch_values;	/* flat array [VEC_BATCH_SIZE * natts] */
	bool		   *batch_nulls;	/* flat array [VEC_BATCH_SIZE * natts] */
	int				batch_count;
	int				batch_index;
	bool			batch_done;
	int64			total_passed;
	int64			total_filtered;
} VecScanState;

extern void VecFillBatch(VecScanState *vstate);

#endif							/* VECSCAN_H */
