#!/usr/bin/env node
const API_KEY = process.env.BDE_DDDICE_API_KEY?.trim() || "";
if (!API_KEY) { console.error("Error: BDE_DDDICE_API_KEY is not set."); process.exit(1); }

const THEME_ID = "bde-obsidian-gold";
const THEME_NAME = "BDE Obsidian Gold";

// Much darker — almost black but still catches light
const DARK_GREY   = { r: 0.025, g: 0.025, b: 0.03 };
// Rustic/antique gold (brownish, less yellow)
const RUSTIC_GOLD = { r: 0.72, g: 0.52, b: 0.1 };

const manifest = {
  id: THEME_ID,
  name: THEME_NAME,
  version: "1.0.5",
  api_version: "2.0",
  description: "Dark obsidian dice with rustic gold numbers for Black Dice Engine.",
  label: { color: "#c9a227", background_color: "#0a0a0a" },
  extend: "dddice-half",
  uniforms: {
    diffuse: { type: "color", value: DARK_GREY },
    number:  { type: "color", value: RUSTIC_GOLD },
    specular: { type: "color", value: { r: 0.15, g: 0.12, b: 0.1 } },
    shininess: { type: "f", value: 35, min: 0, max: 100 }
  }
};

async function createTheme() {
  const boundary = "----BdeFormBoundary" + Math.random().toString(36).slice(2);
  const parts = [];
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${JSON.stringify(manifest)}`);
  parts.push(`--${boundary}--\r\n`);
  const body = parts.join("\r\n");

  const response = await fetch("https://dddice.com/api/1.0/theme", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Accept": "application/json"
    },
    body
  });

  const data = await response.json().catch(() => ({}));
  console.log("Status:", response.status);
  if (response.ok) {
    console.log(`Updated: ${data.data?.id} v${data.data?.version}`);
    console.log(`URL: https://dddice.com/theme/${data.data?.id}`);
  } else {
    console.error(JSON.stringify(data, null, 2));
  }
}

createTheme().catch(err => { console.error(err); process.exit(1); });
