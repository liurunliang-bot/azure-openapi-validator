import { JsonPath } from "../types"
import { rules } from "../types"
import { MergeStates, OpenApiTypes } from "../types"
import { ArmUtils } from "./utilities/ArmUtils"

export const NestedResourcesMustHaveListOperation: string = "NestedResourcesMustHaveListOperation"

rules.push({
  id: "R4015",
  name: NestedResourcesMustHaveListOperation,
  severity: "error",
  category: "ARMViolation",
  mergeState: MergeStates.composed,
  openapiType: OpenApiTypes.arm,

  *run(doc, node, path) {
    const msg: string = 'The nested resource "{0}" does not have list operation, please add it.'
    /**
     * 1 get all nested resources that have point get resource
     * 2 travel all resources by searching in all get/put operations and find all the resources that have a collection get
     */
    const utils = new ArmUtils(doc)
    const nestedResource = utils.getAllNestedResources()
    const allCollectionApis = utils.getCollectionApiInfo()
    for (const resource of nestedResource) {
      const hasMatched = allCollectionApis.some(collection => resource === collection.childModelName)
      if (!hasMatched) {
        yield {
          message: msg.replace("{0}", resource),
          location: ["$", "definitions", resource] as JsonPath
        }
      }
    }
  }
})