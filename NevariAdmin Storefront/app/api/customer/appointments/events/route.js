import { subscribeAppointmentEvents } from "../_hub";

const encoder = new TextEncoder();

export const dynamic = "force-dynamic";

export async function GET(request) {
  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk) => controller.enqueue(encoder.encode(chunk));
      write("event: ready\n");
      write(`data: ${JSON.stringify({ ok: true })}\n\n`);

      const unsubscribe = subscribeAppointmentEvents((event) => {
        write("event: appointment\n");
        write(`data: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        write(": keep-alive\n\n");
      }, 25000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // stream may already be closed
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
