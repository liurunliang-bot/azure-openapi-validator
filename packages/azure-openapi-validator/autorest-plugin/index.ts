/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-nocheck
import { safeLoad } from "js-yaml"
import { AutoRestPluginHost } from "./jsonrpc/plugin-host"
const jp = require("jsonpath")
import {getRuleSet} from "./loader"
import { Message } from "./jsonrpc/types"
const { Spectral } = require("@stoplight/spectral-core")
const { Resolver } = require("@stoplight/spectral-ref-resolver");
import {lint, getOpenapiType, LintResultMessage} from "@microsoft.azure/openapi-validator-core"
import {rulesets,spectralArmFile} from "@microsoft.azure/openapi-validator-rulesets"
import {mergeRulesets} from "./loader"
import { fileURLToPath } from 'url';


async function runSpectral(doc:any,filePath:string, sendMessage: (m: Message) => void, spectral:any) {

  const mergedResults = []
  const convertSeverity = (severity: number) => {
    switch (severity) {
      case 0:
        return "error"
      case 1:
        return "warning"
      case 2:
        return "info"
      default:
        return "info"
    }
  }
  const convertRange = (range: any) => {
    return {
      start: {
        line: range.start.line + 1,
        column: range.start.character
      },
      end: {
        line: range.end.line + 1,
        column: range.end.character
      }
    }
  }

  const format = (result, spec) => {
    return {
      code: result.code,
      message: result.message,
      type: convertSeverity(result.severity),
      jsonpath: result.path && result.path.length ? jp.stringify(result.path) : "$",
      range: convertRange(result.range),
      sources: [`${spec}:${result.range.start.line}:${result.range.start.character}`],
      location: {
        line: result.range.start.line + 1,
        column: result.range.start.character
      }
    }
  }
  const results = await spectral.run(doc)
  mergedResults.push(...results.map(result => format(result, filePath)))
 for (const message of mergedResults) {
  sendMessage({
    Channel: message.type,
    Text: message.message,
    Key: [message.code],
    Source: [
      {
        document : message.sources[0],
        Position: { path: message["jsonpath"] }
      }
    ],
    Details: {
      type: message.type,
      code: message.code,
      message: message.message,
      id: message.code,
    }
  })

 }

  return mergedResults
}




async function main() {
  const pluginHost = new AutoRestPluginHost()
  pluginHost.Add("spectral", async initiator => {
    const files = await initiator.ListInputs()
    const mergeState: string = await initiator.GetValue("merge-state")
    const openapiType: string = await initiator.GetValue("openapi-type")
    let subType: string = await initiator.GetValue("openapi-subtype")
    const resolveFile = (uri:any) =>{
            const ref = uri.href();
            const content = readFile(ref);
            return content
          }
    const resolver = new Resolver({
      resolvers: {
        file: {
          resolve: resolveFile
        },
        http: {
          resolve: resolveFile
        },
        https:{
           resolve: resolveFile
        }
      },
    });

    const cachedFiles = new Map<string,any>()
    const readFile = async (fileUri:string) => {
      let file = cachedFiles.get(fileUri)
      if (!file) {
        file = await initiator.ReadFile(fileUri)
        cachedFiles.set(fileUri,file)
      }
      return file
    }



    const spectral = new Spectral({resolver})
    const rules = await getRuleSet(spectralArmFile())
    spectral.setRuleset(rules)
    subType = subType === "providerHub" ? "rpaas" : subType
    for (const file of files) {
      initiator.Message({
        Channel: "verbose",
        Text: `Validating '${file}'`
      })

      try {
        const openapiDefinitionDocument = await readFile(file)
        const openapiDefinitionObject = safeLoad(openapiDefinitionDocument)
        const normolizedFile = file.startsWith("file:///") ? fileURLToPath(file) : file
        await runSpectral(openapiDefinitionObject,normolizedFile, initiator.Message.bind(initiator),spectral)
   
      } catch (e) {
        initiator.Message({
          Channel: "fatal",
          Text: `Failed validating: '${file}', error encountered: ` + e
        })
      }
    }
  })

  pluginHost.Add("openapi-validator", async initiator => {
    const files = await initiator.ListInputs()
    let openapiType: string = await initiator.GetValue("openapi-type")
    let subType: string = await initiator.GetValue("openapi-subtype")
    subType = subType === "providerHub" ? "rpaas" : subType
    if (subType === "rpaas") {
      openapiType = "rpaas"
    }
    const convertMessage = (msg:LintResultMessage)=> {
        initiator.Message({
        Channel: msg.type,
        Text: msg.message,
        Key: [msg.code, msg.category],
        Source: [
          {
            document:msg.sources[0] ,
            Position: msg.location
          }
        ],
        Details: {
          type: msg.type,
          code: msg.code,
          message: msg.message,
          id: msg.id,
          validationCategory: msg.category,
        }
      })
    }

    const cachedFiles = new Map<string,any>()
    const readFile = async (fileUri:string) => {
      let file = cachedFiles.get(fileUri)
      if (!file) {
        file = await initiator.ReadFile(fileUri)
        cachedFiles.set(fileUri,file)
      }
      return file
    }

    const defaultFleSystem = {
       read: readFile
    }
    initiator.Message({
      Channel: "verbose",
      Text: `Validating '${files.join("\n")}'`
    })
    try {
      const mergedRuleset = mergeRulesets(Object.values(rulesets))
      await lint(files,{ruleSet:mergedRuleset, fileSystem:defaultFleSystem,openapiType:getOpenapiType(openapiType)},convertMessage)
    } catch (e) {
      initiator.Message({
        Channel: "fatal",
        Text: `Failed validating:` + e
      })
    }
  })

  await pluginHost.Run()
}

main()