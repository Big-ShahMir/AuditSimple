import { StateGraph, START, END } from "@langchain/langgraph";
import { UpdaterStateAnnotation } from "./state";
import { fetchBocNode } from "./nodes/fetch-boc";
import { scrapeWsNode } from "./nodes/scrape-ws";
import { upsertDbNode } from "./nodes/upsert-db";

const graph = new StateGraph(UpdaterStateAnnotation)
    .addNode("fetch_boc", fetchBocNode)
    .addNode("scrape_ws", scrapeWsNode)
    .addNode("upsert_db", upsertDbNode)
    .addEdge(START, "fetch_boc")
    .addEdge("fetch_boc", "scrape_ws")
    .addEdge("scrape_ws", "upsert_db")
    .addEdge("upsert_db", END)
    .compile();

export async function runBenchmarkUpdate() {
    return await graph.invoke({ bocRates: [], wsRates: [], upsertedCount: 0, errors: [] });
}
