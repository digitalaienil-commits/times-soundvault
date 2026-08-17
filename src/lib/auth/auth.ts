import "server-only";

import { getDatabase } from "@/lib/database/database";

import { createSoundVaultAuth } from "./auth-factory";
import { getAuthEnvironment } from "./environment";

export const auth = createSoundVaultAuth(getAuthEnvironment(), getDatabase());
