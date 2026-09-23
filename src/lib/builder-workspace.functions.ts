/**
 * Builder workspace edit path (theme purge, Task 4).
 *
 * The builder UI imports ONLY from this module — never from the theme
 * lifecycle (`./themes.functions` registry/install/preset-swap/demo/update
 * functions) or `./themes/*` (activation/preview). The seven functions below
 * are the section/token edit path: workspace bootstrap, autosave, versions
 * and scheduling. Their theme-table persistence contract is owned by Task 5
 * (DB retirement) and is intentionally unchanged here.
 */
export {
  builderAutosaveFn,
  builderCancelScheduleFn,
  builderCommitFn,
  builderPublishFn,
  builderRollbackFn,
  builderScheduleFn,
  builderWorkspaceFn,
} from "./themes.functions";
