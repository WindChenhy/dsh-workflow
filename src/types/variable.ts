/** Variable API shim: implementation lives in the shared core. */
export {
  VariableType,
  VARIABLE_TYPE_LABELS,
  VARIABLE_TYPE_COLORS,
  NODE_OUTPUT_DEFAULTS,
} from '../core/types'
export type { VariableSource, VariableDef, NodeOutputVar } from '../core/types'
export {
  makeVarRef,
  extractVarRefs,
  resolveTemplate,
  resolveTemplateWithReport,
  getByPath,
} from '../core/variables'
