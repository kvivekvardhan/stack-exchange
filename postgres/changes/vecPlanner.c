/*-------------------------------------------------------------------------
 *
 * vecPlanner.c
 *	  Experimental planner hook for adding a Vectorized Seq Scan CustomPath.
 *
 * Phase 1 only adds this path beside PostgreSQL's normal paths.  It does not
 * remove the existing executor patch and it does not yet replace aggregate
 * planning.  Aggregate pushdown belongs in a later create_upper_paths_hook
 * phase.
 *
 *-------------------------------------------------------------------------
 */
#include "postgres.h"

#include "catalog/pg_type_d.h"
#include "nodes/extensible.h"
#include "optimizer/cost.h"
#include "optimizer/pathnode.h"
#include "optimizer/paths.h"
#include "utils/guc.h"
#include "utils/lsyscache.h"

#include <stdlib.h>
#include <string.h>

extern CustomPathMethods VecCustomPathMethods;
extern void VecRegisterCustomScan(void);

void VecInstallPlannerHook(void);
void VecUninstallPlannerHook(void);

static set_rel_pathlist_hook_type prev_set_rel_pathlist_hook = NULL;
static bool vec_planner_hook_installed = false;
static bool vectorized_scan_enabled = true;

static bool
VecPlannerEnabled(void)
{
	return vectorized_scan_enabled;
}

static bool
VecRelationHasRequiredAttrs(Oid relid)
{
	AttrNumber	posttype_attno;
	AttrNumber	score_attno;

	if (!OidIsValid(relid))
		return false;

	posttype_attno = get_attnum(relid, "posttypeid");
	score_attno = get_attnum(relid, "score");

	return AttributeNumberIsValid(posttype_attno) &&
		   AttributeNumberIsValid(score_attno) &&
		   get_atttype(relid, posttype_attno) == INT4OID &&
		   get_atttype(relid, score_attno) == INT4OID;
}

static void
VecSetRelPathlist(PlannerInfo *root, RelOptInfo *rel,
				  Index rti, RangeTblEntry *rte)
{
	CustomPath *path;

	if (prev_set_rel_pathlist_hook != NULL)
		prev_set_rel_pathlist_hook(root, rel, rti, rte);

	if (!VecPlannerEnabled())
		return;

	if (rte == NULL || rte->rtekind != RTE_RELATION)
		return;

	if (rel == NULL || rel->reloptkind != RELOPT_BASEREL)
		return;

	if (!VecRelationHasRequiredAttrs(rte->relid))
		return;

	elog(LOG, "VECTORIZED: adding CustomPath for relation %u", rte->relid);

	path = makeNode(CustomPath);
	path->path.pathtype = T_CustomScan;
	path->path.parent = rel;
	path->path.pathtarget = rel->reltarget;
	path->path.param_info = NULL;
	path->path.parallel_aware = false;
	path->path.parallel_safe = false;
	path->path.parallel_workers = 0;
	path->path.rows = rel->rows;
	path->flags = CUSTOMPATH_SUPPORT_PROJECTION;
	path->custom_paths = NIL;
	path->custom_private = NIL;
	path->methods = &VecCustomPathMethods;

	cost_seqscan(&path->path, root, rel, NULL);

	/*
	 * Phase 2 verification: force the planner to prefer this custom path even
	 * for LIMIT queries, where startup cost dominates path selection.  Later
	 * this needs a real vectorized cost model.
	 */
	path->path.startup_cost = 0;
	path->path.total_cost = 1;

	add_path(rel, (Path *) path);
}

void
VecInstallPlannerHook(void)
{
	const char *pg_vec = getenv("PG_VECTORIZED");

	if (vec_planner_hook_installed)
		return;

	/* Default on; only suppress if PG_VECTORIZED is explicitly "0". */
	if (pg_vec != NULL)
		vectorized_scan_enabled = strcmp(pg_vec, "0") != 0;
	DefineCustomBoolVariable("vectorized_scan",
							 "Enables the StackFast vectorized CustomScan path.",
							 "When enabled, eligible base table scans receive a Vectorized Seq Scan CustomPath.",
							 &vectorized_scan_enabled,
							 vectorized_scan_enabled,
							 PGC_USERSET,
							 0,
							 NULL,
							 NULL,
							 NULL);

	VecRegisterCustomScan();

	prev_set_rel_pathlist_hook = set_rel_pathlist_hook;
	set_rel_pathlist_hook = VecSetRelPathlist;
	vec_planner_hook_installed = true;
	elog(LOG, "VECTORIZED: CustomScan planner hook installed");
}

void
VecUninstallPlannerHook(void)
{
	if (set_rel_pathlist_hook == VecSetRelPathlist)
		set_rel_pathlist_hook = prev_set_rel_pathlist_hook;
	prev_set_rel_pathlist_hook = NULL;
	vec_planner_hook_installed = false;
}
