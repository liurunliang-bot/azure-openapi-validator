/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { JsonPath } from "./types"
import { DocumentDependencyGraph } from "./depsGraph"

export enum OpenApiTypes {
  "default" = 1 << 0,
  "arm" = 1 << 1,
  "dataplane" = 1 << 2,
  "rpaas" = 1 << 3
}

export enum MergeStates {
  "individual",
  "composed"
}

export interface ValidationMessage {
  message: string
  location: JsonPath
}

export interface RuleContext {
  graph?: DocumentDependencyGraph
  specPath: string
}
export type IRuleFunction = (
  openapiDocument: any,
  openapiSection: any,
  location: JsonPath,
  ctx?: RuleContext,
  opt?: any
) => Iterable<ValidationMessage> | AsyncIterable<ValidationMessage>

export interface Rule {
  readonly id: string // see Rxxx/Sxxx codes on https://github.com/Azure/azure-rest-api-specs/blob/master/documentation/openapi-authoring-automated-guidelines.md
  readonly name: string // see same website as above
  readonly category: "ARMViolation" | "OneAPIViolation" | "SDKViolation" | "RPaaSViolation"
  readonly severity: "error" | "warning"
  readonly mergeState: MergeStates
  readonly openapiType: OpenApiTypes
  readonly appliesTo_JsonQuery?: string | string[] // see https://www.npmjs.com/package/jsonpath#jsonpath-syntax for syntax and samples
  run: IRuleFunction
}

export const rules: Rule[] = []
