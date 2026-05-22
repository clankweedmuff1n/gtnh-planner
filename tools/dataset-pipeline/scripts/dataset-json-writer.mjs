import fs from "node:fs/promises";

export async function writeDatasetJson(filePath, dataset) {
  const handle = await fs.open(filePath, "w");
  try {
    await handle.write("{\n");
    const entries = Object.entries(dataset);
    for (let index = 0; index < entries.length; index += 1) {
      const [key, value] = entries[index];
      await writeJsonProperty(handle, key, value, index === 0);
    }
    await handle.write("\n}\n");
  } finally {
    await handle.close();
  }
}

async function writeJsonProperty(handle, key, value, first = false) {
  await handle.write(`${first ? "" : ",\n"}  ${JSON.stringify(key)}: `);

  if (Array.isArray(value)) {
    await writeJsonArray(handle, value);
    return;
  }

  if (isPlainObject(value) && shouldStreamObject(value)) {
    await writeJsonObject(handle, value);
    return;
  }

  await handle.write(JSON.stringify(value));
}

async function writeJsonArray(handle, values) {
  await handle.write("[");
  for (let index = 0; index < values.length; index += 1) {
    await handle.write(`${index === 0 ? "\n" : ",\n"}    ${JSON.stringify(values[index])}`);
  }
  await handle.write(values.length > 0 ? "\n  ]" : "]");
}

async function writeJsonObject(handle, value) {
  const entries = Object.entries(value);
  await handle.write("{");
  for (let index = 0; index < entries.length; index += 1) {
    const [entryKey, entryValue] = entries[index];
    await handle.write(
      `${index === 0 ? "\n" : ",\n"}    ${JSON.stringify(entryKey)}: ${JSON.stringify(entryValue)}`,
    );
  }
  await handle.write(entries.length > 0 ? "\n  }" : "}");
}

function shouldStreamObject(value) {
  return Object.keys(value).length > 32;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && value.constructor === Object;
}
