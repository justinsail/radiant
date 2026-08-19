// Curated catalog of models pullable through Ollama, with approximate
// download sizes and RAM needed to run comfortably (Q4-ish quants).
// ramGB is the working-set estimate used for the "runs well on this Mac" badge.

export const CATALOG = [
  {
    family: 'Qwen 3.8', category: 'general', desc: 'Alibaba\'s latest general/agentic line — strong tool use and reasoning.',
    variants: [
      { tag: 'qwen3.8:8b', params: '8B', dlGB: 5.2, ramGB: 8 },
      { tag: 'qwen3.8:27b-mlx', params: '27B', dlGB: 18.2, ramGB: 24 }
    ]
  },
  {
    family: 'Qwen 3', category: 'general', desc: 'Hybrid thinking models with tool support, tiny to huge.',
    variants: [
      { tag: 'qwen3:0.6b', params: '0.6B', dlGB: 0.5, ramGB: 2 },
      { tag: 'qwen3:1.7b', params: '1.7B', dlGB: 1.4, ramGB: 3 },
      { tag: 'qwen3:4b', params: '4B', dlGB: 2.6, ramGB: 5 },
      { tag: 'qwen3:8b', params: '8B', dlGB: 5.2, ramGB: 8 },
      { tag: 'qwen3:14b', params: '14B', dlGB: 9.3, ramGB: 13 },
      { tag: 'qwen3:30b-a3b', params: '30B MoE', dlGB: 19, ramGB: 22 },
      { tag: 'qwen3:32b', params: '32B', dlGB: 20, ramGB: 24 }
    ]
  },
  {
    family: 'GPT-OSS', category: 'reasoning', desc: 'OpenAI\'s open-weight reasoning models.',
    variants: [
      { tag: 'gpt-oss:20b', params: '21B MoE', dlGB: 14, ramGB: 16 },
      { tag: 'gpt-oss:120b', params: '117B MoE', dlGB: 65, ramGB: 72 }
    ]
  },
  {
    family: 'Gemma 4', category: 'general', desc: 'Google\'s newest open models, multimodal.',
    variants: [
      { tag: 'gemma4:4b', params: '4B', dlGB: 3.3, ramGB: 6 },
      { tag: 'gemma4:12b', params: '12B', dlGB: 8.1, ramGB: 12 },
      { tag: 'gemma4:27b', params: '27B', dlGB: 17, ramGB: 22 }
    ]
  },
  {
    family: 'Gemma 3', category: 'general', desc: 'Vision-capable, 128K context, single-GPU friendly.',
    variants: [
      { tag: 'gemma3:1b', params: '1B', dlGB: 0.8, ramGB: 2 },
      { tag: 'gemma3:4b', params: '4B', dlGB: 3.3, ramGB: 6 },
      { tag: 'gemma3:12b', params: '12B', dlGB: 8.1, ramGB: 12 },
      { tag: 'gemma3:27b', params: '27B', dlGB: 17, ramGB: 22 }
    ]
  },
  {
    family: 'DeepSeek-R1', category: 'reasoning', desc: 'Open reasoning models distilled from DeepSeek\'s flagship.',
    variants: [
      { tag: 'deepseek-r1:1.5b', params: '1.5B', dlGB: 1.1, ramGB: 3 },
      { tag: 'deepseek-r1:7b', params: '7B', dlGB: 4.7, ramGB: 7 },
      { tag: 'deepseek-r1:8b', params: '8B', dlGB: 5.2, ramGB: 8 },
      { tag: 'deepseek-r1:14b', params: '14B', dlGB: 9, ramGB: 13 },
      { tag: 'deepseek-r1:32b', params: '32B', dlGB: 20, ramGB: 24 },
      { tag: 'deepseek-r1:70b', params: '70B', dlGB: 43, ramGB: 48 }
    ]
  },
  {
    family: 'Llama 3.x', category: 'general', desc: 'Meta\'s open models — the 8B is a dependable all-rounder.',
    variants: [
      { tag: 'llama3.2:1b', params: '1B', dlGB: 1.3, ramGB: 3 },
      { tag: 'llama3.2:3b', params: '3B', dlGB: 2, ramGB: 4 },
      { tag: 'llama3.1:8b', params: '8B', dlGB: 4.9, ramGB: 8 },
      { tag: 'llama3.3:70b', params: '70B', dlGB: 43, ramGB: 48 }
    ]
  },
  {
    family: 'Qwen 2.5 Coder', category: 'coding', desc: 'Code-specialized Qwen — excellent local pair programmer.',
    variants: [
      { tag: 'qwen2.5-coder:1.5b', params: '1.5B', dlGB: 1, ramGB: 3 },
      { tag: 'qwen2.5-coder:7b', params: '7B', dlGB: 4.7, ramGB: 7 },
      { tag: 'qwen2.5-coder:14b', params: '14B', dlGB: 9, ramGB: 13 },
      { tag: 'qwen2.5-coder:32b', params: '32B', dlGB: 20, ramGB: 24 }
    ]
  },
  {
    family: 'Devstral', category: 'coding', desc: 'Mistral\'s agentic coding model, built for tool-using agents.',
    variants: [
      { tag: 'devstral:24b', params: '24B', dlGB: 14, ramGB: 18 }
    ]
  },
  {
    family: 'Codestral', category: 'coding', desc: 'Mistral\'s code model — 80+ languages, fill-in-the-middle.',
    variants: [
      { tag: 'codestral:22b', params: '22B', dlGB: 13, ramGB: 16 }
    ]
  },
  {
    family: 'StarCoder2', category: 'coding', desc: 'BigCode\'s permissive code models.',
    variants: [
      { tag: 'starcoder2:3b', params: '3B', dlGB: 1.7, ramGB: 4 },
      { tag: 'starcoder2:7b', params: '7B', dlGB: 4, ramGB: 7 },
      { tag: 'starcoder2:15b', params: '15B', dlGB: 9.1, ramGB: 13 }
    ]
  },
  {
    family: 'Phi-4', category: 'general', desc: 'Microsoft\'s small models that punch far above their size.',
    variants: [
      { tag: 'phi4-mini:3.8b', params: '3.8B', dlGB: 2.5, ramGB: 5 },
      { tag: 'phi4:14b', params: '14B', dlGB: 9.1, ramGB: 13 }
    ]
  },
  {
    family: 'Mistral', category: 'general', desc: 'The classic 7B plus the efficient Small line.',
    variants: [
      { tag: 'mistral:7b', params: '7B', dlGB: 4.1, ramGB: 7 },
      { tag: 'mistral-nemo:12b', params: '12B', dlGB: 7.1, ramGB: 11 },
      { tag: 'mistral-small:24b', params: '24B', dlGB: 14, ramGB: 18 }
    ]
  },
  {
    family: 'Ministral 3', category: 'general', desc: 'Mistral\'s compact edge-class models.',
    variants: [
      { tag: 'ministral-3:14b', params: '14B', dlGB: 8.6, ramGB: 13 }
    ]
  },
  {
    family: 'LFM 2', category: 'general', desc: 'Liquid AI\'s efficient hybrid models.',
    variants: [
      { tag: 'lfm2:24b', params: '24B', dlGB: 14, ramGB: 18 }
    ]
  },
  {
    family: 'QwQ', category: 'reasoning', desc: 'Qwen\'s dedicated deep-reasoning model.',
    variants: [
      { tag: 'qwq:32b', params: '32B', dlGB: 20, ramGB: 24 }
    ]
  },
  {
    family: 'Magistral', category: 'reasoning', desc: 'Mistral\'s transparent, multilingual reasoner.',
    variants: [
      { tag: 'magistral:24b', params: '24B', dlGB: 14, ramGB: 18 }
    ]
  },
  {
    family: 'Qwen 2.5 VL', category: 'vision', desc: 'Vision-language: reads screenshots, documents, and photos.',
    variants: [
      { tag: 'qwen2.5vl:3b', params: '3B', dlGB: 3.2, ramGB: 5 },
      { tag: 'qwen2.5vl:7b', params: '7B', dlGB: 6, ramGB: 9 },
      { tag: 'qwen2.5vl:32b', params: '32B', dlGB: 21, ramGB: 26 }
    ]
  },
  {
    family: 'LLaVA', category: 'vision', desc: 'The original open vision-chat model.',
    variants: [
      { tag: 'llava:7b', params: '7B', dlGB: 4.7, ramGB: 8 },
      { tag: 'llava:13b', params: '13B', dlGB: 8, ramGB: 12 }
    ]
  },
  {
    family: 'Granite 3.3', category: 'general', desc: 'IBM\'s enterprise-friendly open models.',
    variants: [
      { tag: 'granite3.3:2b', params: '2B', dlGB: 1.5, ramGB: 3 },
      { tag: 'granite3.3:8b', params: '8B', dlGB: 4.9, ramGB: 8 }
    ]
  },
  {
    family: 'SmolLM2', category: 'general', desc: 'Tiny models that run on anything.',
    variants: [
      { tag: 'smollm2:360m', params: '360M', dlGB: 0.7, ramGB: 1 },
      { tag: 'smollm2:1.7b', params: '1.7B', dlGB: 1.8, ramGB: 3 }
    ]
  },
  {
    family: 'Dolphin 3', category: 'general', desc: 'Community fine-tune tuned for helpful chat.',
    variants: [
      { tag: 'dolphin3:8b', params: '8B', dlGB: 4.9, ramGB: 8 }
    ]
  },
  {
    family: 'Nomic Embed', category: 'embedding', desc: 'Fast local text embeddings for search and RAG.',
    variants: [
      { tag: 'nomic-embed-text', params: '137M', dlGB: 0.3, ramGB: 1 }
    ]
  },
  {
    family: 'MxBai Embed', category: 'embedding', desc: 'High-quality large embedding model.',
    variants: [
      { tag: 'mxbai-embed-large', params: '335M', dlGB: 0.7, ramGB: 1 }
    ]
  }
]
