// Demo stand-in for Higgsfield: "generates" in ~3 seconds, so the flow can be tried.
export function demoGen() {
  const id = () => Math.random().toString(36).slice(2, 10);
  return {
    available: () => true,
    async productImages() {
      return [];
    },
    async startImages(o) {
      return { provider: "demo", requestId: id(), at: new Date().toISOString(), n: o.batch || 4 };
    },
    async startVideo() {
      return { provider: "demo", requestId: id(), at: new Date().toISOString(), video: true };
    },
    async poll(job) {
      if (Date.now() - Date.parse(job.at) < 3000) return { done: false };
      if (job.video) return { done: true, video: `demo:${job.requestId}:v` };
      return { done: true, images: Array.from({ length: job.n }, (_, i) => `demo:${job.requestId}:${i}`) };
    },
  };
}
