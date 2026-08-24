import json
V={r["repo"]:r for r in json.load(open('verified.json'))}
# name + blurb, authored; size/arch/stop come from the verified probe so they
# can never drift from what was measured.
ROWS=[
("Google","gemma3-270m","Gemma 3 270M","mlx-community/gemma-3-270m-it-4bit","The smallest model here. Instant, for simple rewrites."),
("Google","gemma3-1b","Gemma 3 1B","mlx-community/gemma-3-1b-it-qat-4bit","Trained for its quantization, so it holds up small. Steady writer."),
("Google","gemma2-2b","Gemma 2 2B","mlx-community/gemma-2-2b-it-4bit","The older generation, still a dependable everyday model."),
("Google","gemma4-e2b","Gemma 4 E2B","mlx-community/gemma-4-E2B-it-qat-mobile","Google's newest, in the build they made for phones."),
("Google","gemma3n-e2b","Gemma 3n E2B","mlx-community/gemma-3n-E2B-it-lm-4bit","Built for on-device use. Good general knowledge."),
("Google","gemma3-4b","Gemma 3 4B","mlx-community/gemma-3-4b-it-qat-4bit","Strong at long answers and summarizing."),
("Google","gemma4-e4b","Gemma 4 E4B","mlx-community/gemma-4-E4B-it-qat-mobile","Google's phone flagship, and one of the best here."),
("Google","gemma3n-e4b","Gemma 3n E4B","mlx-community/gemma-3n-E4B-it-lm-4bit","The larger on-device Gemma. Wants room."),
("Google","gemma2-9b","Gemma 2 9B","mlx-community/gemma-2-9b-it-4bit","Desktop-class. Only a 12 GB iPhone gets near it."),
("Alibaba","qwen3-0.6b","Qwen 3 0.6B","mlx-community/Qwen3-0.6B-4bit","Tiny and instant. Quick questions and rewriting."),
("Alibaba","qwen2.5-1.5b","Qwen 2.5 1.5B","mlx-community/Qwen2.5-1.5B-Instruct-4bit","The proven older generation. Reliable, well understood."),
("Alibaba","qwen3-1.7b","Qwen 3 1.7B","mlx-community/Qwen3-1.7B-4bit","The best all-rounder on any recent iPhone."),
("Alibaba","qwen2.5-3b","Qwen 2.5 3B","mlx-community/Qwen2.5-3B-Instruct-4bit","More knowledge than the 1.5B, same steady behavior."),
("Alibaba","qwen3.5-2b","Qwen 3.5 2B","mlx-community/Qwen3.5-2B-4bit","Newest generation. Sharper reasoning for its size."),
("Alibaba","qwen3-4b","Qwen 3 4B","mlx-community/Qwen3-4B-Instruct-2507-4bit","Noticeably smarter, and good at code."),
("Alibaba","qwen3.5-4b","Qwen 3.5 4B","mlx-community/Qwen3.5-4B-MLX-4bit","The most capable all-rounder that still fits a phone."),
("Alibaba","qwen3-8b","Qwen 3 8B","mlx-community/Qwen3-8B-4bit","Desktop-class reasoning. Needs a 12 GB iPhone."),
("Meta","llama3.2-1b","Llama 3.2 1B","mlx-community/Llama-3.2-1B-Instruct-4bit","Small and fast. Fine for short answers."),
("Meta","llama3.2-3b","Llama 3.2 3B","mlx-community/Llama-3.2-3B-Instruct-4bit","Strong at everyday writing and rewriting."),
("Meta","llama3.1-8b","Llama 3.1 8B","mlx-community/Meta-Llama-3.1-8B-Instruct-4bit","The full-size Llama. Only for the largest iPhones."),
("Mistral","ministral3-3b","Ministral 3 3B","mlx-community/Ministral-3-3B-Instruct-2512-4bit","Mistral's edge model. Fluent, and good in French."),
("Mistral","mistral-7b","Mistral 7B","mlx-community/Mistral-7B-Instruct-v0.3-4bit","The classic. Even-handed and hard to trip up."),
("Mistral","mistral-nemo","Mistral NeMo 12B","mlx-community/Mistral-Nemo-Instruct-2407-4bit","Large and multilingual. Past what any iPhone can hold."),
("Microsoft","bitnet-2b","BitNet b1.58 2B","mlx-community/bitnet-b1.58-2B-4T-4bit","An experiment: barely over one bit per weight. Tiny for its size."),
("Microsoft","phi3.5-mini","Phi 3.5 mini","mlx-community/Phi-3.5-mini-instruct-4bit","Trained on textbook-style data. Careful and precise."),
("Microsoft","phi4-mini","Phi 4 mini","mlx-community/Phi-4-mini-instruct-4bit","Punches above its size at math and code."),
("IBM","granite4-micro","Granite 4.0 Micro","mlx-community/granite-4.0-h-micro-4bit","Built for work: summarizing, extraction, tool use."),
("IBM","granite4.1-3b","Granite 4.1 3B","mlx-community/granite-4.1-3b-mxfp4","IBM's newest small model. Business documents and data."),
("IBM","granite4-tiny","Granite 4.0 Tiny","mlx-community/granite-4.0-h-tiny-4bit","The larger Granite. Long documents, if you have the room."),
("Liquid AI","lfm2-350m","LFM2 350M","mlx-community/LFM2-350M-4bit","The lightest model here. Runs on anything, answers instantly."),
("Liquid AI","lfm2.5-1.2b","LFM2.5 1.2B","mlx-community/LFM2.5-1.2B-Instruct-4bit","Designed for phones. Fastest of the genuinely capable ones."),
("Liquid AI","lfm2.5-2.6b","LFM2.5 2.6B","mlx-community/LFM2.5-2.6B-mxfp4","Still quick, and noticeably more able."),
("Liquid AI","lfm2-8b-a1b","LFM2 8B A1B","mlx-community/LFM2-8B-A1B-3bit-MLX","Only part of it runs per word, so it is faster than its size."),
("DeepSeek","deepseek-r1-1.5b","DeepSeek R1 1.5B","mlx-community/DeepSeek-R1-Distill-Qwen-1.5B-4bit","Thinks before it answers. Slower, better at problems."),
("DeepSeek","deepseek-r1-7b","DeepSeek R1 7B","mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit","The same reasoning, with far more knowledge behind it."),
("Hugging Face","smollm2-360m","SmolLM2 360M","mlx-community/SmolLM2-360M-Instruct","Very small, and honest about it. Good for quick tasks."),
("Hugging Face","smollm3-3b","SmolLM3 3B","mlx-community/SmolLM3-3B-4bit","Open training data end to end. Strong at chat."),
("NVIDIA","nemotron3-4b","Nemotron 3 Nano 4B","mlx-community/NVIDIA-Nemotron-3-Nano-4B-4bit","Built for reasoning and calling tools."),
("LG","exaone4-1.2b","EXAONE 4.0 1.2B","mlx-community/exaone-4.0-1.2b-4bit","Small, and unusually good at following instructions."),
("Allen AI","olmo3-7b","Olmo 3 7B","mlx-community/Olmo-3-7B-Instruct-4bit","Fully open: data, code, weights. A research favorite."),
("TII","falcon-h1-0.5b","Falcon H1 0.5B","mlx-community/Falcon-H1-0.5B-Instruct-4bit","Tiny, with a long memory for its size."),
("TII","falcon-h1-1.5b","Falcon H1 1.5B","mlx-community/Falcon-H1-1.5B-Instruct-4bit","Handles long inputs better than most at this size."),
("TII","falcon-h1-3b","Falcon H1 3B","mlx-community/Falcon-H1-3B-Instruct-4bit","The largest Falcon that still suits a phone."),
("OpenAI","gpt-oss-20b","gpt-oss 20B","mlx-community/gpt-oss-20b-MXFP4-Q8","OpenAI's open model. Listed so you can see the ceiling."),
]
# registry constants, preferred where one exists: MLX curates the stop tokens
REG={"mlx-community/Qwen3-0.6B-4bit":"qwen3_0_6b_4bit",
 "mlx-community/Qwen2.5-1.5B-Instruct-4bit":"qwen2_5_1_5b",
 "mlx-community/Qwen3-1.7B-4bit":"qwen3_1_7b_4bit",
 "mlx-community/Qwen3.5-2B-4bit":"qwen3_5_2b_4bit",
 "mlx-community/Qwen3-8B-4bit":"qwen3_8b_4bit",
 "mlx-community/Llama-3.2-1B-Instruct-4bit":"llama3_2_1B_4bit",
 "mlx-community/Llama-3.2-3B-Instruct-4bit":"llama3_2_3B_4bit",
 "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit":"llama3_1_8B_4bit",
 "mlx-community/Mistral-7B-Instruct-v0.3-4bit":"mistral7B4bit",
 "mlx-community/Mistral-Nemo-Instruct-2407-4bit":"mistralNeMo4bit",
 "mlx-community/Phi-3.5-mini-instruct-4bit":"phi3_5_4bit",
 "mlx-community/gemma-3-1b-it-qat-4bit":"gemma3_1B_qat_4bit",
 "mlx-community/gemma-2-2b-it-4bit":"gemma_2_2b_it_4bit",
 "mlx-community/gemma-2-9b-it-4bit":"gemma_2_9b_it_4bit",
 "mlx-community/gemma-3n-E2B-it-lm-4bit":"gemma3n_E2B_it_lm_4bit",
 "mlx-community/gemma-3n-E4B-it-lm-4bit":"gemma3n_E4B_it_lm_4bit",
 "mlx-community/SmolLM3-3B-4bit":"smollm3_3b_4bit",
 "mlx-community/exaone-4.0-1.2b-4bit":"exaone_4_0_1_2b_4bit",
 "mlx-community/bitnet-b1.58-2B-4T-4bit":"bitnet_b1_58_2b_4t_4bit",
 "mlx-community/LFM2-8B-A1B-3bit-MLX":"lfm2_8b_a1b_3bit_mlx",
 "mlx-community/DeepSeek-R1-Distill-Qwen-7B-4bit":"deepSeekR1_7B_4bit",
 "mlx-community/gpt-oss-20b-MXFP4-Q8":"gpt_oss_20b_MXFP4_Q8",
 "mlx-community/Nemotron-Labs-Diffusion-3B-4bit":"nemotron_labs_diffusion_3b_4bit"}
out=[]
cur=None
for maker,mid,name,repo,blurb in ROWS:
    v=V[repo]
    if maker!=cur:
        out.append(f"\n        // ---- {maker} ----"); cur=maker
    if repo in REG:
        cfg=f"LLMRegistry.{REG[repo]}"
    else:
        stop=v["stop"]
        cfg=f'rxRepo("{repo}"' + (f', stop: "{stop}"' if stop else '') + ')'
    out.append(f'        Entry(id: "{mid}", name: "{name}", maker: "{maker}",')
    out.append(f'              blurb: "{blurb}",')
    out.append(f'              gb: {v["gb"]}, config: {cfg}),')
body="\n".join(out).rstrip(',')
open('catalog.swift','w').write(body)
print(f"{len([r for r in ROWS])} entries across {len(set(r[0] for r in ROWS))} makers")
