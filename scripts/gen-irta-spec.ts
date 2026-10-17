// Перевыпуск спецификации формата .irta из описаний полей программы.
//   npm run irta-spec
import { writeFileSync } from "fs";
import { buildIrtaSpec } from "../src/project/spec";
writeFileSync(new URL("../docs/ФОРМАТ-IRTA.md", import.meta.url), buildIrtaSpec(), "utf8");
console.log("docs/ФОРМАТ-IRTA.md обновлён");
