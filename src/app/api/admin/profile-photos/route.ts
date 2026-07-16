import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAllowedAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function isMatchingImage(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

function getAvatarStoragePath(photoUrl: string, supabaseUrl: string) {
  try {
    const photo = new URL(photoUrl);
    const project = new URL(supabaseUrl);
    const marker = "/storage/v1/object/public/avatars/";
    if (photo.origin !== project.origin || !photo.pathname.includes(marker)) return null;
    const encodedPath = photo.pathname.slice(photo.pathname.indexOf(marker) + marker.length);
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

function isPrivatePhotoHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true;
  }
  const match = host.match(/^172\.(\d{1,3})\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

async function fetchPublicPhoto(initialUrl: URL) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (
      currentUrl.protocol !== "https:" ||
      currentUrl.username ||
      currentUrl.password ||
      isPrivatePhotoHost(currentUrl.hostname)
    ) {
      throw new Error("This photo source cannot be edited.");
    }
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location || redirectCount === 3) throw new Error("Could not follow this photo source.");
    currentUrl = new URL(location, currentUrl);
  }
  throw new Error("Could not follow this photo source.");
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Admin session is required." }, { status: 401 });

    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await verifier.auth.getUser(token);
    if (userError || !isAllowedAdminEmail(userData.user?.email)) {
      return NextResponse.json({ error: "This account cannot edit profile photos." }, { status: 403 });
    }

    const requestUrl = new URL(request.url);
    const profileId = String(requestUrl.searchParams.get("profileId") || "").trim();
    const photoUrl = String(requestUrl.searchParams.get("photoUrl") || "").trim();
    if (!UUID_PATTERN.test(profileId) || !photoUrl) {
      return NextResponse.json({ error: "Choose a valid profile photo." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, photos")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profile was not found." }, { status: 404 });
    const photos = Array.isArray(profile.photos)
      ? profile.photos.filter((photo): photo is string => typeof photo === "string" && Boolean(photo.trim()))
      : [];
    if (!photos.includes(photoUrl)) {
      return NextResponse.json({ error: "This photo is no longer on the profile." }, { status: 404 });
    }

    const imageResponse = await fetchPublicPhoto(new URL(photoUrl));
    if (!imageResponse.ok) {
      return NextResponse.json({ error: "Could not download this photo for editing." }, { status: 502 });
    }
    const contentType = String(imageResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES[contentType]) {
      return NextResponse.json({ error: "Only JPG, PNG, or WebP photos can be edited." }, { status: 415 });
    }
    const contentLength = Number(imageResponse.headers.get("content-length") || 0);
    if (contentLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "This photo is too large to edit." }, { status: 413 });
    }
    const imageBytes = await imageResponse.arrayBuffer();
    if (!imageBytes.byteLength || imageBytes.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "This photo is empty or too large to edit." }, { status: 413 });
    }
    if (!isMatchingImage(new Uint8Array(imageBytes), contentType)) {
      return NextResponse.json({ error: "This photo file is not valid." }, { status: 415 });
    }

    return new Response(imageBytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open this photo.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Admin session is required." }, { status: 401 });

    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await verifier.auth.getUser(token);
    if (userError || !isAllowedAdminEmail(userData.user?.email)) {
      return NextResponse.json({ error: "This account cannot add profile photos." }, { status: 403 });
    }

    const formData = await request.formData();
    const profileId = String(formData.get("profileId") || "").trim();
    const files = formData.getAll("photos").filter((item): item is File => item instanceof File);
    const legacyFile = formData.get("photo");
    if (!files.length && legacyFile instanceof File) files.push(legacyFile);
    if (!UUID_PATTERN.test(profileId)) {
      return NextResponse.json({ error: "Choose a valid profile first." }, { status: 400 });
    }
    if (!files.length) {
      return NextResponse.json({ error: "Choose at least one image to upload." }, { status: 400 });
    }
    if (files.length > MAX_PHOTOS) {
      return NextResponse.json({ error: "Choose no more than 5 photos." }, { status: 400 });
    }

    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, photos")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profile was not found." }, { status: 404 });

    const currentPhotos = Array.isArray(profile.photos)
      ? profile.photos.filter((photo): photo is string => typeof photo === "string" && Boolean(photo.trim()))
      : [];
    if (currentPhotos.length >= MAX_PHOTOS) {
      return NextResponse.json({ error: "This profile already has 5 photos." }, { status: 409 });
    }
    const remainingSlots = MAX_PHOTOS - currentPhotos.length;
    if (files.length > remainingSlots) {
      return NextResponse.json(
        { error: `This profile can accept ${remainingSlots} more photo${remainingSlots === 1 ? "" : "s"}.` },
        { status: 409 }
      );
    }

    const preparedFiles: Array<{ file: File; bytes: Uint8Array; extension: string }> = [];
    for (const file of files) {
      if (!ALLOWED_TYPES[file.type]) {
        return NextResponse.json({ error: "Use only JPG, PNG, or WebP images." }, { status: 400 });
      }
      if (!file.size || file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Each image must be 8 MB or smaller." }, { status: 400 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isMatchingImage(bytes, file.type)) {
        return NextResponse.json({ error: `${file.name || "One selected file"} is not a valid image.` }, { status: 400 });
      }
      preparedFiles.push({ file, bytes, extension: ALLOWED_TYPES[file.type] });
    }

    const uploaded: Array<{ storagePath: string; publicUrl: string }> = [];
    try {
      for (const { file, bytes, extension } of preparedFiles) {
        const storagePath = `admin/${profileId}/${Date.now()}-${randomUUID()}.${extension}`;
        const { error: uploadError } = await admin.storage.from("avatars").upload(storagePath, bytes, {
          contentType: file.type,
          cacheControl: "31536000",
          upsert: false,
        });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = admin.storage.from("avatars").getPublicUrl(storagePath);
        uploaded.push({ storagePath, publicUrl: publicUrlData.publicUrl });
      }
    } catch (uploadError) {
      if (uploaded.length) {
        await admin.storage.from("avatars").remove(uploaded.map((item) => item.storagePath));
      }
      throw uploadError;
    }

    const photos = [...currentPhotos, ...uploaded.map((item) => item.publicUrl)];
    const { error: updateError } = await admin.from("profiles").update({ photos }).eq("id", profileId);
    if (updateError) {
      await admin.storage.from("avatars").remove(uploaded.map((item) => item.storagePath));
      throw updateError;
    }

    return NextResponse.json({ photos, photoUrls: uploaded.map((item) => item.publicUrl) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload this photo.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Admin session is required." }, { status: 401 });

    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await verifier.auth.getUser(token);
    if (userError || !isAllowedAdminEmail(userData.user?.email)) {
      return NextResponse.json({ error: "This account cannot edit profile photos." }, { status: 403 });
    }

    const formData = await request.formData();
    const profileId = String(formData.get("profileId") || "").trim();
    const photoUrl = String(formData.get("photoUrl") || "").trim();
    const file = formData.get("photo");
    if (!UUID_PATTERN.test(profileId) || !photoUrl || !(file instanceof File)) {
      return NextResponse.json({ error: "Choose a valid profile photo." }, { status: 400 });
    }
    if (!ALLOWED_TYPES[file.type]) {
      return NextResponse.json({ error: "Use only JPG, PNG, or WebP images." }, { status: 400 });
    }
    if (!file.size || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "The edited image must be 8 MB or smaller." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isMatchingImage(bytes, file.type)) {
      return NextResponse.json({ error: "The edited photo is not a valid image." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, photos")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profile was not found." }, { status: 404 });

    const currentPhotos = Array.isArray(profile.photos)
      ? profile.photos.filter((photo): photo is string => typeof photo === "string" && Boolean(photo.trim()))
      : [];
    const photoIndex = currentPhotos.indexOf(photoUrl);
    if (photoIndex < 0) {
      return NextResponse.json({ error: "This photo is no longer on the profile." }, { status: 404 });
    }

    const extension = ALLOWED_TYPES[file.type];
    const storagePath = `admin/${profileId}/${Date.now()}-${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("avatars").upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: publicUrlData } = admin.storage.from("avatars").getPublicUrl(storagePath);
    const photos = [...currentPhotos];
    photos[photoIndex] = publicUrlData.publicUrl;
    const { error: updateError } = await admin.from("profiles").update({ photos }).eq("id", profileId);
    if (updateError) {
      await admin.storage.from("avatars").remove([storagePath]);
      throw updateError;
    }

    const previousStoragePath = getAvatarStoragePath(photoUrl, supabaseUrl);
    let storageWarning = "";
    if (previousStoragePath) {
      const { error: removeError } = await admin.storage.from("avatars").remove([previousStoragePath]);
      if (removeError) storageWarning = "Crop was saved, but old storage cleanup needs review.";
    }
    return NextResponse.json({ photos, photoUrl: publicUrlData.publicUrl, warning: storageWarning || undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this crop.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Admin session is required." }, { status: 401 });

    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await verifier.auth.getUser(token);
    if (userError || !isAllowedAdminEmail(userData.user?.email)) {
      return NextResponse.json({ error: "This account cannot reorder profile photos." }, { status: 403 });
    }

    const body = (await request.json()) as { profileId?: unknown; photos?: unknown };
    const profileId = String(body.profileId || "").trim();
    const photos = Array.isArray(body.photos)
      ? body.photos.map((photo) => String(photo || "").trim()).filter(Boolean)
      : [];
    if (!UUID_PATTERN.test(profileId) || !photos.length || photos.length > MAX_PHOTOS) {
      return NextResponse.json({ error: "Choose a valid profile photo order." }, { status: 400 });
    }
    if (new Set(photos).size !== photos.length) {
      return NextResponse.json({ error: "The photo order contains duplicates." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, photos")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profile was not found." }, { status: 404 });

    const currentPhotos = Array.isArray(profile.photos)
      ? profile.photos.filter((photo): photo is string => typeof photo === "string" && Boolean(photo.trim()))
      : [];
    const samePhotos =
      currentPhotos.length === photos.length &&
      currentPhotos.every((photo) => photos.includes(photo));
    if (!samePhotos) {
      return NextResponse.json({ error: "Photo gallery changed. Refresh and try again." }, { status: 409 });
    }

    const { error: updateError } = await admin.from("profiles").update({ photos }).eq("id", profileId);
    if (updateError) throw updateError;
    return NextResponse.json({ photos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not change the photo order.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Admin session is required." }, { status: 401 });

    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await verifier.auth.getUser(token);
    if (userError || !isAllowedAdminEmail(userData.user?.email)) {
      return NextResponse.json({ error: "This account cannot delete profile photos." }, { status: 403 });
    }

    const body = (await request.json()) as { profileId?: unknown; photoUrl?: unknown };
    const profileId = String(body.profileId || "").trim();
    const photoUrl = String(body.photoUrl || "").trim();
    if (!UUID_PATTERN.test(profileId) || !photoUrl) {
      return NextResponse.json({ error: "Choose a valid profile photo." }, { status: 400 });
    }

    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, photos")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: "Profile was not found." }, { status: 404 });

    const currentPhotos = Array.isArray(profile.photos)
      ? profile.photos.filter((photo): photo is string => typeof photo === "string" && Boolean(photo.trim()))
      : [];
    if (!currentPhotos.includes(photoUrl)) {
      return NextResponse.json({ error: "This photo is no longer on the profile." }, { status: 404 });
    }

    const photos = currentPhotos.filter((photo) => photo !== photoUrl);
    const { error: updateError } = await admin.from("profiles").update({ photos }).eq("id", profileId);
    if (updateError) throw updateError;

    const storagePath = getAvatarStoragePath(photoUrl, supabaseUrl);
    let storageWarning = "";
    if (storagePath) {
      const { error: removeError } = await admin.storage.from("avatars").remove([storagePath]);
      if (removeError) storageWarning = "Photo was removed from the profile but storage cleanup needs review.";
    }

    return NextResponse.json({ photos, warning: storageWarning || undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete this photo.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
