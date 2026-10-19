/** Fixed endpoints only. API secrets never leave the server. */
const endpoints={openai:"https://api.openai.com/v1/chat/completions",groq:"https://api.groq.com/openai/v1/chat/completions",gemini:"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",openrouter:"https://openrouter.ai/api/v1/chat/completions"};
export function llmConfig(env:Record<string,string|undefined>=process.env){
 const provider=env.LLM_PROVIDER??"openai";
 if(!Object.hasOwn(endpoints,provider))return null;
 const key=env.LLM_API_KEY??(provider==="openai"?env.OPENAI_API_KEY:undefined);
 const model=env.LLM_MODEL??(provider==="openai"?env.OPENAI_MODEL??"gpt-4.1-mini":undefined);
 if(!key?.trim()||!model?.trim())return null;
 return {provider,url:endpoints[provider as keyof typeof endpoints],key,model};
}
