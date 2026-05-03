const http = require('http');

const workflow = {
  "1": { "inputs": { "ckpt_name": "sdxl_lightning_4step.safetensors" }, "class_type": "CheckpointLoaderSimple" },
  "2": { "inputs": { "text": "fantasy tavern interior warm candlelight wooden beams adventurers", "clip": ["1", 1] }, "class_type": "CLIPTextEncode" },
  "3": { "inputs": { "text": "blurry distorted ugly lowres", "clip": ["1", 1] }, "class_type": "CLIPTextEncode" },
  "4": { "inputs": { "width": 1024, "height": 704, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
  "5": { "inputs": { "seed": 777, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0] }, "class_type": "KSampler" },
  "6": { "inputs": { "samples": ["5", 0], "vae": ["1", 2] }, "class_type": "VAEDecode" },
  "7": { "inputs": { "filename_prefix": "bde/test2", "images": ["6", 0] }, "class_type": "SaveImage" }
};

function post(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({ hostname: '127.0.0.1', port: 8188, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}

async function main() {
  const t0 = Date.now();
  console.log('Submitting...');
  const { prompt_id } = await post('/prompt', { prompt: workflow });
  
  let completed = false;
  while (!completed) {
    await new Promise(r => setTimeout(r, 200));
    const history = await post('/history', { prompt_id });
    const job = history[prompt_id];
    if (job && job.outputs && job.outputs['7']) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log('DONE in', elapsed + 's');
      console.log('File:', job.outputs['7'].images[0].filename);
      process.exit(0);
    }
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
