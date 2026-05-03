const http = require('http');

const testWorkflow = {
  "1": {
    "inputs": { "ckpt_name": "sdxl_lightning_4step.safetensors" },
    "class_type": "CheckpointLoaderSimple"
  },
  "2": {
    "inputs": {
      "text": "a beautiful fantasy castle on a cliff, dramatic lighting, high quality",
      "clip": ["1", 1]
    },
    "class_type": "CLIPTextEncode"
  },
  "3": {
    "inputs": {
      "text": "blurry, low quality, watermark",
      "clip": ["1", 1]
    },
    "class_type": "CLIPTextEncode"
  },
  "4": {
    "inputs": { "width": 1024, "height": 704, "batch_size": 1 },
    "class_type": "EmptyLatentImage"
  },
  "5": {
    "inputs": {
      "seed": 42,
      "steps": 4,
      "cfg": 1.0,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["1", 0],
      "positive": ["2", 0],
      "negative": ["3", 0],
      "latent_image": ["4", 0]
    },
    "class_type": "KSampler"
  },
  "6": {
    "inputs": {
      "samples": ["5", 0],
      "vae": ["1", 2]
    },
    "class_type": "VAEDecode"
  },
  "7": {
    "inputs": {
      "filename_prefix": "bde/test",
      "images": ["6", 0]
    },
    "class_type": "SaveImage"
  }
};

function post(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8188,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('Submitting test workflow to ComfyUI...');
  console.log('Model: sdxl_lightning_4step.safetensors');
  console.log('Steps: 4 | CFG: 1.0 | Size: 1024x704');
  console.log('');

  const startTime = Date.now();
  const { prompt_id } = await post('/prompt', { prompt: testWorkflow });
  console.log('Job submitted! ID:', prompt_id);
  console.log('Polling for completion...');
  console.log('');

  let completed = false;
  let lastStatus = '';

  while (!completed) {
    await new Promise(r => setTimeout(r, 500));
    const history = await post('/history', { prompt_id });
    const job = history[prompt_id];

    if (!job) {
      process.stdout.write('.');
      continue;
    }

    if (job.status) {
      const statusText = job.status.status_str;
      if (statusText !== lastStatus) {
        lastStatus = statusText;
        console.log('\nStatus:', statusText);
        if (job.status.messages) {
          const lastMsg = job.status.messages[job.status.messages.length - 1];
          if (lastMsg) console.log('Step:', JSON.stringify(lastMsg));
        }
      }
    }

    if (job.outputs && job.outputs['7']) {
      completed = true;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('');
      console.log('✅ SUCCESS! Image generated in', elapsed + 's');
      console.log('Files:', job.outputs['7'].images.map(i => i.filename).join(', '));
      process.exit(0);
    }

    if (job.status && job.status.completed === false && job.status.status_str === 'error') {
      console.log('\n❌ ERROR:', JSON.stringify(job.status, null, 2));
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
