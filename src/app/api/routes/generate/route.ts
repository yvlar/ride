import { generateLoopRide } from "@/application/generate-loop-ride";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Le corps de la requête doit être un JSON valide.",
          suggestions: ["Envoyez un objet JSON avec type: \"loop\"."],
        },
        meta: { requestId },
      },
      { status: 400 },
    );
  }

  const result = await generateLoopRide(body);

  if (!result.ok) {
    const status =
      result.error.code === "VALIDATION_ERROR" ||
      result.error.code === "UNSUPPORTED_RIDE_TYPE"
        ? 400
        : 422;
    return Response.json(
      {
        error: result.error,
        meta: { requestId },
      },
      { status },
    );
  }

  return Response.json({
    data: {
      route: result.route,
    },
    meta: { requestId },
  });
}
