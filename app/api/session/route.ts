import { v4 as uuidv4 } from 'uuid';
import { cookies } from "next/headers";

export async function GET() {
    const sessionCookie = cookies().get('session')?.value;
    if (!sessionCookie) {
      const sessionId = uuidv4();
    //  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week
  
      // Set the session cookie
      cookies().set('session', sessionId, {
        httpOnly: true,
        secure: true,
    //    expires: expiresAt,
        sameSite: 'lax',
        path: '/',
      });
    }
    // Log the sessionCookie
    console.log("SessionCookie: ", sessionCookie);
    // Return the session ID
    return new Response(sessionCookie, {
      status: 200,
    });
}  