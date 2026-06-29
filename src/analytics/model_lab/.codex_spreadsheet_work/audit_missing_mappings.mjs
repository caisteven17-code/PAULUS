import fs from "node:fs";

const source = fs.readFileSync(".codex_spreadsheet_work/build_paulus_acceptance.mjs", "utf8");
const moduleBlock = source.match(/const moduleData = \[([\s\S]*?)\n\];/)[1];
const subtaskBlock = source.match(/const subtasks = \{([\s\S]*?)\n\};\n\nconst theme/)[1];

const taskCodes = [...moduleBlock.matchAll(/\["([^"]+)"\s*,/g)].map((match) => match[1]);
const mappedCodes = [
  ...subtaskBlock.matchAll(/^\s*(?:"([^"]+)"|([A-Z0-9-]+)):\s*(?:\[|standardSubtasks\()/gm),
].map((match) => match[1] ?? match[2]);
const missing = taskCodes.filter((code) => !mappedCodes.includes(code));

console.log(JSON.stringify({ totalTaskCodes: taskCodes.length, missing }, null, 2));
