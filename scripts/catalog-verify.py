import json,urllib.request,re,time,concurrent.futures as cf
UA={"User-Agent":"radiant-catalog/1"}
ARCHS=set(open('archs.txt').read().split())
def get(u,raw=False,tries=4):
    for k in range(tries):
        try:
            r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60)
            return r.read().decode() if raw else json.load(r)
        except Exception: time.sleep(1.2*(k+1))
    return None
CAND=json.load(open('cands.json'))
def check(row):
    mid=row["repo"]
    meta=get(f"https://huggingface.co/api/models/{mid}?blobs=true")
    if not meta: return {**row,"err":"no repo"}
    gb=round(sum(f.get("size") or 0 for f in meta.get("siblings") or [])/1e9,2)
    cfg=get(f"https://huggingface.co/{mid}/raw/main/config.json") or {}
    arch=cfg.get("model_type") or (cfg.get("text_config") or {}).get("model_type")
    tc=get(f"https://huggingface.co/{mid}/raw/main/tokenizer_config.json") or {}
    eos=tc.get("eos_token"); eos=eos.get("content") if isinstance(eos,dict) else eos
    tmpl=tc.get("chat_template") or get(f"https://huggingface.co/{mid}/raw/main/chat_template.jinja",raw=True) or ""
    if isinstance(tmpl,list): tmpl=json.dumps(tmpl)
    toks=set(re.findall(r'<\|[a-z_]{2,24}\|>|<end_of_turn>|<turn\|>|\[\|[a-z]+\|\]|</s>|<\|im_end\|>', tmpl))
    # the stop token is the template's turn-end when it differs from eos_token
    stop=None
    for t in ("<turn|>","<end_of_turn>","<|end|>","<|im_end|>","<|eot_id|>"):
        if t in toks and t!=eos: stop=t; break
    return {**row,"gb":gb,"arch":arch,"ok":arch in ARCHS,"eos":eos,"stop":stop,
            "dl":meta.get("downloads",0)}
out=[]
with cf.ThreadPoolExecutor(10) as ex:
    for r in ex.map(check,CAND): out.append(r)
json.dump(out,open('verified.json','w'),indent=1)
bad=[r for r in out if r.get("err") or not r.get("ok")]
print(f"verified {len(out)}, problems {len(bad)}")
for r in bad: print("  BAD",r["repo"],r.get("err") or r.get("arch"))
for r in sorted(out,key=lambda r:(r["maker"],r.get("gb",0))):
    if r.get("err") or not r.get("ok"): continue
    print(f'{r["maker"]:<14} {r.get("gb"):>5} {r["arch"]:<12} stop={str(r["stop"]):<16} {r["repo"]}')
