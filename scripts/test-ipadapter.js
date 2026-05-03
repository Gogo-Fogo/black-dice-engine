const http = require('http');

const wf = {
  "1": { "inputs": { "ckpt_name": "sdxl_lightning_4step.safetensors" }, "class_type": "CheckpointLoaderSimple" },
  "2": { "inputs": { "text": "fantasy dwarf rogue red beard leather armor holding glowing dagger dark stone corridor dramatic lighting", "clip": ["1", 1] }, "class_type": "CLIPTextEncode" },
  "3": { "inputs": { "text": "blurry distorted ugly lowres different face", "clip": ["1", 1] }, "class_type": "CLIPTextEncode" },
  "4": { "inputs": { "image": "ref_jepstein.png" }, "class_type": "LoadImage" },
  "5": { "inputs": { "clip_name": "CLIP-ViT-H-14-laion2B-s32B-b79K\\model.safetensors" }, "class_type": "CLIPVisionLoader" },
  "6": { "inputs": { "ipadapter_file": "ip-adapter-plus_sdxl_vit-h.safetensors" }, "class_type": "IPAdapterModelLoader" },
  "7": { "inputs": { "model": ["1", 0], "ipadapter": ["6", 0], "image": ["4", 0], "clip_vision": ["5", 0], "weight": 0.85, "weight_type": "linear", "combine_embeds": "concat", "start_at": 0.0, "end_at": 1.0, "embeds_scaling": "V only" }, "class_type": "IPAdapterAdvanced" },
  "8": { "inputs": { "width": 832, "height": 1216, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
  "9": { "inputs": { "seed": 42, "steps": 4, "cfg": 2.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["7", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["8", 0] }, "class_type": "KSampler" },
  "10": { "inputs": { "samples": ["9", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
  "11": { "inputs": { "filename_prefix": "bde/ipatest", "images": ["10", 0] }, "class_type": "SaveImage" }
};

function post(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const h = { hostname: '127.0.0.1', port: 8188, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
    const req = http.request(h, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(b); } }); });
    req.on('error', reject); req.write(payload); req.end();
  });
}

async function main() {
  const t0 = Date.now();
  const result = await post('/prompt', { prompt: wf });
  if (!result.prompt_id) { console.log('FAIL:', JSON.stringify(result).slice(0, 500)); process.exit(1); }
  console.log('Testing IPAdapter Advanced...');

  while (true) {
    await new Promise(r => setTimeout(r, 1500));
    const history = await post('/history', { prompt_id: result.prompt_id });
    const job = history[result.prompt_id];
    if (!job) continue;
    if (job.status?.status_str === 'error') { console.log('ERROR:', JSON.stringify(job.status.messages?.find(m=>m[0]==='execution_error')?.[1], null, 2).slice(0, 600)); process.exit(1); }
    if (job.outputs?.['11']) {
      console.log('DONE in', ((Date.now() - t0) / 1000).toFixed(1) + 's:', job.outputs['11'].images[0].filename);
      process.exit(0);
    }
  }
}
main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
