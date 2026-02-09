/**
 * Append system_group, space_group, tags to every finding in profiles/finding_profiles.yml
 * using classifyFinding(). Does not change any existing 9-dimension fields or text.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { classifyFinding } from "../netlify/functions/lib/findingClassification";

const projectRoot = path.resolve(__dirname, "..");
const profilesPath = path.join(projectRoot, "profiles", "finding_profiles.yml");

type ProfilesDoc = {
  version?: string;
  meta?: unknown;
  finding_profiles?: Record<string, Record<string, unknown>>;
};

function main() {
  const content = fs.readFileSync(profilesPath, "utf8");
  const data = yaml.load(content) as ProfilesDoc;
  const profiles = data.finding_profiles ?? {};
  let added = 0;
  for (const [findingId, profile] of Object.entries(profiles)) {
    if (!profile || typeof profile !== "object") continue;
    const c = classifyFinding(findingId);
    let changed = false;
    if (profile.system_group == null || profile.system_group === "") {
      profile.system_group = c.system_group;
      changed = true;
    }
    if (profile.space_group == null || profile.space_group === "") {
      profile.space_group = c.space_group;
      changed = true;
    }
    if (!Array.isArray(profile.tags) || profile.tags.length === 0) {
      profile.tags = c.tags;
      changed = true;
    }
    if (changed) added++;
  }
  const out = yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: false });
  fs.writeFileSync(profilesPath, out, "utf8");
  console.log(`[apply-finding-classification] Added system_group/space_group/tags to ${added} findings.`);
}

main();
