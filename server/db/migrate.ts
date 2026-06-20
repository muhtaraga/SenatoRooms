import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./index";
import { normalizeTurkishMobilePhone } from "../utils/phone";

migrate(db, { migrationsFolder: "./server/db/migrations" });

const users = sqlite.prepare("select id, phone from users").all() as Array<{ id: string; phone: string }>;
const existingPhones = new Set(users.map((user) => user.phone));
const updatePhone = sqlite.prepare("update users set phone = ? where id = ?");

for (const user of users) {
  const normalized = normalizeTurkishMobilePhone(user.phone);
  if (!normalized || normalized === user.phone || existingPhones.has(normalized)) continue;
  updatePhone.run(normalized, user.id);
  existingPhones.add(normalized);
}

console.log("Database migrations applied.");
