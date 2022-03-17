// @ts-nocheck
import * as _ from "lodash"
import * as path from "path"
const DepGraph = require("dependency-graph").DepGraph
import glob = require("glob")
import { OpenapiDocument } from "./document"
import { JsonParser } from "./jsonParser"
import { isAbsolute, normalize } from "path"
import { defaultFileSystem, normalizePath } from "./utils"
import { ISwaggerInventory } from "./types"
import { IFileSystem } from "."

export class SwaggerInventory implements ISwaggerInventory {
  private inventory = new DepGraph()
  private referenceCache = new Map<string, OpenapiDocument>()
  private allDocs = new Map<string, any>()

  constructor(private fileSystem:IFileSystem = defaultFileSystem){

  }

  public getDocument(specPath: string) {
    const urlPath = normalizePath(specPath)
    if (this.referenceCache.has(urlPath)) {
      return this.referenceCache.get(urlPath)
    }
    throw new Error(`No cached file:${specPath}`)
  }

  public dependantsOf(specPath: string) {
    return this.inventory.dependantsOf(normalizePath(specPath))
  }

  public dependenciesOf(specPath: string) {
    return this.inventory.dependenciesOf(normalizePath(specPath))
  }

  public getDocFromJsonRef(ref: string) {
    const urlPath = normalizePath(ref)
    if (this.referenceCache.has(urlPath)) {
      return this.referenceCache.get(urlPath)
    }
    return undefined
  }
  public getAllDocuments(): Map<string, any> {
      return this.allDocs
  }

  public async scanFolder(folderPath: string, options: any) {
    const specPaths: string[] = glob.sync(path.join(folderPath, "**/*.json"), {
      ignore: ["**/examples/**/*.json"]
    })
    for (const spec of specPaths) {
      const simpleSpec = normalizePath(spec)
      this.createIfNotExists(simpleSpec)

      const refs = await this.getReferences(spec)
      for (const ref of refs) {
        if (options.ignoreCommonType && this.isCommonTypes(ref)) {
          continue
        }
        const simpleRef = normalizePath(ref)
        this.createIfNotExists(simpleRef)

        if (simpleRef !== simpleSpec) {
          this.inventory.addDependency(simpleSpec, simpleRef)
        }
      }
    }
  }

  isCommonTypes(specPath: string) {
    return specPath.match(/.*common-types[\\|\/]resource\-management[\\|\/]v\d[\\|\/].+\.json$/)
  }

  createIfNotExists(node: string) {
    if (!this.inventory.hasNode(node)) {
      this.inventory.addNode(node)
    }
  }

  getApiVersion(fullPath: string) {
    const segments = fullPath.split(/\\|\//)
    return segments[segments.length - 2]
  }

  public async generateGraph(folderPath: string) {
    const options = { ignoreCommonType: false, outputReadmeGraph: true }
    await this.scanFolder(folderPath, options)
  }

  private async getReferences(specPath: string): Promise<string[]> {
    const document = await this.cacheDocument(normalizePath(specPath))
    return document.getReferences()
  }

  async loadDocument(specPath: string) {
    if (!isAbsolute(specPath)) {
      specPath = normalize(specPath)
    }
    const urlPath = normalizePath(specPath)
    if (this.referenceCache.has(urlPath)) {
      return this.referenceCache.get(urlPath)
    }
    const cache = await this.cacheDocument(urlPath)
    const references = cache.getReferences()
    const promises = []
    for (const ref of references) {
      promises.push(this.cacheDocument(ref))
    }
    await Promise.all(promises)
    return cache
  }

  async cacheDocument(specPath: string) {
    const parser = new JsonParser()
    const document = new OpenapiDocument(specPath, parser,this.fileSystem)
    await document.resolve()
    this.referenceCache.set(specPath, document)
    this.allDocs.set(specPath,document.getContent())
    return document
  }

}