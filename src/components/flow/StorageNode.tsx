"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FactoryStorage, StorageThroughputResult } from "@/lib/model/types";
import { formatRate, makeResourceKey } from "@/lib/model";
import { ResourceIcon } from "@/components/nei/ResourceIcon";
import { useFactoryStore } from "@/store/factory-store";
import { makeResourceHandleId } from "./resource-handles";

export interface StorageNodeData extends Record<string, unknown> {
  storage: FactoryStorage;
  result?: StorageThroughputResult;
}

export type StorageFlowNode = Node<StorageNodeData, "storageNode">;

export function StorageNode({ data }: NodeProps<StorageFlowNode>) {
  const { storage, result } = data;
  const deleteStorage = useFactoryStore((state) => state.deleteStorage);
  const hoveredStorageResourceKey = useFactoryStore((state) => state.hoveredStorageResourceKey);
  const setHoveredStorageResourceKey = useFactoryStore((state) => state.setHoveredStorageResourceKey);
  const resourceKey = makeResourceKey(storage.kind, storage.resourceId);
  const isHighlighted = hoveredStorageResourceKey === resourceKey;
  const title = storage.kind === "fluid" ? "Super Tank I" : "Storage Drawer";
  const produced = result?.producedPerSecond ?? 0;
  const consumed = result?.consumedPerSecond ?? 0;
  const net = result?.netPerSecond ?? 0;
  const unit = storage.kind === "fluid" ? "L/s" : "/s";

  return (
    <div
      onMouseEnter={() => setHoveredStorageResourceKey(resourceKey)}
      onMouseLeave={() => setHoveredStorageResourceKey(undefined)}
      className={[
        "group relative w-[156px] border-2 border-[#252525] text-[#202020]",
        storage.kind === "fluid"
          ? "bg-[#b9c0d6] shadow-[inset_2px_2px_0_#e4e8f5,inset_-2px_-2px_0_#636b82]"
          : "bg-[#7a5a2f] shadow-[inset_3px_3px_0_#a98249,inset_-3px_-3px_0_#3d2b17]",
        isHighlighted ? "ring-4 ring-cyan-300" : "",
      ].join(" ")}
    >
      <Handle
        id={makeResourceHandleId("input", { kind: storage.kind, id: storage.resourceId })}
        type="target"
        position={Position.Left}
        className="!-left-1.5 !h-3 !w-3 !border-2 !border-white !bg-cyan-600 !opacity-0 group-hover:!opacity-100"
      />
      <Handle
        id={makeResourceHandleId("output", { kind: storage.kind, id: storage.resourceId })}
        type="source"
        position={Position.Right}
        className="!-right-1.5 !h-3 !w-3 !border-2 !border-white !bg-emerald-600 !opacity-0 group-hover:!opacity-100"
      />

      <div className="flex h-7 items-center gap-1 border-b-2 border-[#565656] bg-[#a9a9a9] px-1 shadow-[inset_1px_1px_0_#dedede]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            deleteStorage(storage.id);
          }}
          className="nodrag h-5 w-5 border border-[#252525] bg-[#7d7d7d] text-sm leading-3 text-white hover:bg-red-700"
          title="Delete storage"
          aria-label="Delete storage"
        >
          -
        </button>
        <div className="minecraft-title min-w-0 flex-1 truncate text-[15px] leading-5">
          {title}
        </div>
      </div>

      <div className={storage.kind === "fluid" ? "p-2" : "p-3"}>
        {storage.kind === "fluid" ? (
          <div className="border-2 border-[#6f7890] bg-[#d8dded] p-1">
            <div className="relative h-[74px] overflow-hidden border-2 border-[#202020] bg-black p-1 text-white">
              <div
                className="absolute bottom-0 left-0 right-0 bg-cyan-500/70"
                style={{ height: `${getFillPercent(result)}%` }}
              />
              <div className="relative z-10 text-[11px] leading-4">
                <div>Fluid Amount</div>
                <div>{formatRate(result?.storedAmount ?? 0, 0)}</div>
              </div>
              <div className="absolute bottom-1 right-1 text-[9px] text-red-200">4ML</div>
            </div>
          </div>
        ) : (
          <div className="grid h-[86px] place-items-center border-2 border-[#4a341c] bg-[#8c6938] shadow-[inset_4px_4px_0_#6a4b28,inset_-4px_-4px_0_#3e2b16]">
            <div className="grid h-12 w-12 place-items-center border-2 border-[#1f1f1f] bg-[#d8c4b4] shadow-[inset_2px_2px_0_#fff,inset_-2px_-2px_0_#7d6d61]">
              <ResourceIcon
                resource={{ ...storage, id: storage.resourceId, amount: 1 }}
                size="sm"
                showAmount={false}
                bare
                className="!h-10 !w-10"
              />
            </div>
          </div>
        )}

        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          <StorageStat label="In" value={`${formatRate(produced, 2)}${unit}`} />
          <StorageStat label="Out" value={`${formatRate(consumed, 2)}${unit}`} />
          <StorageStat label="Net" value={`${net >= 0 ? "+" : ""}${formatRate(net, 2)}${unit}`} />
        </div>
      </div>
    </div>
  );
}

function StorageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#555] bg-[#b6b6b6] px-1 shadow-[inset_1px_1px_0_#eeeeee,inset_-1px_-1px_0_#777]">
      <div className="text-[8px] uppercase text-[#424242]">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}

function getFillPercent(result?: StorageThroughputResult) {
  if (!result || result.capacity <= 0) {
    return 0;
  }

  return Math.max(6, Math.min(100, (result.storedAmount / result.capacity) * 100));
}
