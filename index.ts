import { Database } from "bun:sqlite";
import { serve } from "bun";
import { randomBytes } from "crypto";

// Type definitions
type ShortenedLink = {
  id: number;
  originalUrl: string;
  shortCode: string;
  createdAt: number;
  visits: number;
};

type CreateLinkRequest = {
  url: string;
  customCode?: string;
};

type CreateLinkResponse = {
  success: boolean;
  shortCode: string;
  originalUrl: string;
  shortUrl: string;
};

type RedirectResponse = {
  success: boolean;
  url: string;
};

type ErrorResponse = {
  success: boolean;
  error: string;
};

// Constants
const BASE_URL = process.env.BASE_URL || "http://localhost:1337";
const SHORTCODE_LENGTH = 6;

// Initialize database
const db = new Database("mydb.sqlite", { create: true });

// Create tables if they don't exist
db.exec(`
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_url TEXT NOT NULL,
  short_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  visits INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_short_code ON links(short_code);
`);

// Prepare statements for better performance
const insertLinkStmt = db.prepare(`
INSERT INTO links (original_url, short_code, created_at, visits)
VALUES ($originalUrl, $shortCode, $createdAt, 0)
`);

const getLinkByCodeStmt = db.prepare(`
SELECT id, original_url as originalUrl, short_code as shortCode, created_at as createdAt, visits
FROM links
WHERE short_code = $shortCode
`);

const incrementVisitsStmt = db.prepare(`
UPDATE links
SET visits = visits + 1
WHERE short_code = $shortCode
`);

const getLinkByUrlStmt = db.prepare(`
SELECT id, original_url as originalUrl, short_code as shortCode, created_at as createdAt, visits
FROM links
WHERE original_url = $originalUrl
LIMIT 1
`);

// Link service class with utility functions
class LinkService {
  /**
   * Generate a random short code
   */
  static generateShortCode(length: number = SHORTCODE_LENGTH): string {
    return randomBytes(Math.ceil((length * 3) / 4))
      .toString("base64")
      .replace(/[+/]/g, "")
      .slice(0, length);
  }

  /**
   * Check if a URL is valid
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new shortened link
   */
  static createLink(
    originalUrl: string,
    customCode?: string,
  ): CreateLinkResponse | ErrorResponse {
    // Validate URL
    if (!this.isValidUrl(originalUrl)) {
      return { success: false, error: "Invalid URL" };
    }

    // Check if URL already exists
    const existingLink = getLinkByUrlStmt.get({
      $originalUrl: originalUrl,
    }) as ShortenedLink | null;
    if (existingLink) {
      return {
        success: true,
        shortCode: existingLink.shortCode,
        originalUrl: existingLink.originalUrl,
        shortUrl: `${BASE_URL}/${existingLink.shortCode}`,
      };
    }

    // Generate or use custom short code
    const shortCode = customCode || this.generateShortCode();

    // Check if custom code already exists
    if (customCode) {
      const existingCode = getLinkByCodeStmt.get({
        $shortCode: shortCode,
      }) as ShortenedLink | null;
      if (existingCode) {
        return { success: false, error: "Custom code already in use" };
      }
    }

    // Insert new link
    try {
      insertLinkStmt.run({
        $originalUrl: originalUrl,
        $shortCode: shortCode,
        $createdAt: Date.now(),
      });

      return {
        success: true,
        shortCode,
        originalUrl,
        shortUrl: `${BASE_URL}/${shortCode}`,
      };
    } catch (error) {
      console.error("Error creating link:", error);
      return { success: false, error: "Error creating link" };
    }
  }

  /**
   * Get a link by its short code and increment visit count
   */
  static getLink(shortCode: string): RedirectResponse | ErrorResponse {
    const link = getLinkByCodeStmt.get({
      $shortCode: shortCode,
    }) as ShortenedLink | null;

    if (!link) {
      return { success: false, error: "Link not found" };
    }

    // Increment visit count in a separate transaction
    incrementVisitsStmt.run({ $shortCode: shortCode });

    return { success: true, url: link.originalUrl };
  }
}

// Create the server
export const server = serve({
  port: 1337,
  fetch: async (request: Request) => {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle root path (could serve a simple UI here)
    if (path === "/") {
      return new Response("Link Shortener API", {
        headers: { "Content-Type": "text/plain" },
      });
    }

    // API endpoint to create a short link
    if (path === "/api/shorten" && request.method === "POST") {
      try {
        const body = (await request.json()) as CreateLinkRequest;
        const result = LinkService.createLink(body.url, body.customCode);

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
          status: result.success ? 200 : 400,
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid request" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 400,
          },
        );
      }
    }

    // Handle redirect for short codes
    const shortCode = path.substring(1); // Remove leading slash
    if (shortCode) {
      const result = LinkService.getLink(shortCode);

      if (result.success) {
        return new Response(null, {
          status: 302,
          headers: { Location: (result as RedirectResponse).url },
        });
      } else {
        return new Response("Link not found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        });
      }
    }

    // Handle 404 for any other path
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  },
});

console.log(`Link shortener service running at ${BASE_URL}`);
