import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
} from "firebase/firestore";
import type {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase/firestore";

export const ADMIN_COMMENTS_PAGE_SIZE = 20;

export type AdminUserComment = {
  id: string;
  date: string;
  text: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type AdminCommentsPageResult = {
  items: AdminUserComment[];
  /** 次ページ用。アイテムが無いときは null */
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function adminCommentTodayYmd(): string {
  return ymdLocal(new Date());
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function tsToDate(v: unknown): Date | null {
  if (v && typeof v === "object" && "toDate" in v) {
    const d = (v as Timestamp).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function docToComment(
  id: string,
  data: Record<string, unknown>,
): AdminUserComment {
  return {
    id,
    date: String(data.date ?? ""),
    text: String(data.text ?? ""),
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

/** プロフィール等：全件取得（件数が少ない想定） */
export async function fetchAdminUserComments(
  targetUid: string,
): Promise<AdminUserComment[]> {
  const nuxtApp = useNuxtApp();
  const { waitUntilReady } = useFirebaseAuth();
  await waitUntilReady();
  const uid = targetUid.trim();
  const db = nuxtApp.$firestoreDb;
  if (!db || !uid) return [];
  const col = collection(db, "adminUserComments", uid, "comments");
  const q = query(col, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    docToComment(d.id, d.data() as Record<string, unknown>),
  );
}

/** 管理画面：20件ずつ（`createdAt` 降順） */
export async function fetchAdminUserCommentsPage(
  targetUid: string,
  pageSize: number,
  startAfterSnapshot: QueryDocumentSnapshot<DocumentData> | null,
): Promise<AdminCommentsPageResult> {
  const nuxtApp = useNuxtApp();
  const { waitUntilReady } = useFirebaseAuth();
  await waitUntilReady();
  const uid = targetUid.trim();
  const db = nuxtApp.$firestoreDb;
  if (!db || !uid) {
    return { items: [], lastDoc: null, hasMore: false };
  }
  const col = collection(db, "adminUserComments", uid, "comments");
  const n = Math.max(1, Math.min(pageSize, 50));
  const q = startAfterSnapshot
    ? query(
        col,
        orderBy("createdAt", "desc"),
        startAfter(startAfterSnapshot),
        limit(n + 1),
      )
    : query(col, orderBy("createdAt", "desc"), limit(n + 1));
  const snap = await getDocs(q);
  const docs = snap.docs;
  const hasMore = docs.length > n;
  const pageDocs = hasMore ? docs.slice(0, n) : docs;
  const items = pageDocs.map((d) =>
    docToComment(d.id, d.data() as Record<string, unknown>),
  );
  const lastDoc =
    pageDocs.length > 0 ? pageDocs[pageDocs.length - 1]! : null;
  return { items, lastDoc, hasMore };
}

export async function addAdminUserComment(
  targetUid: string,
  payload: { date: string; text: string },
): Promise<void> {
  const nuxtApp = useNuxtApp();
  const { waitUntilReady } = useFirebaseAuth();
  await waitUntilReady();
  const user = useState<import("firebase/auth").User | null>(
    "firebase-auth-user",
  );
  const uid = targetUid.trim();
  const db = nuxtApp.$firestoreDb;
  if (!db || !uid) throw new Error("Firestore に接続できません。");
  const date = payload.date.trim();
  const text = payload.text.trim();
  if (!isYmd(date)) throw new Error("日付の形式が不正です。");
  if (!text) throw new Error("コメントを入力してください。");
  const authorUid = user.value?.uid ?? "";
  await addDoc(collection(db, "adminUserComments", uid, "comments"), {
    date,
    text,
    createdAt: serverTimestamp(),
    authorUid: authorUid || null,
  });
}

export async function updateAdminUserComment(
  targetUid: string,
  commentId: string,
  payload: { date: string; text: string },
): Promise<void> {
  const nuxtApp = useNuxtApp();
  const { waitUntilReady } = useFirebaseAuth();
  await waitUntilReady();
  const uid = targetUid.trim();
  const id = commentId.trim();
  const db = nuxtApp.$firestoreDb;
  if (!db || !uid || !id) throw new Error("Firestore に接続できません。");
  const date = payload.date.trim();
  const text = payload.text.trim();
  if (!isYmd(date)) throw new Error("日付の形式が不正です。");
  if (!text) throw new Error("コメントを入力してください。");
  await updateDoc(doc(db, "adminUserComments", uid, "comments", id), {
    date,
    text,
    updatedAt: serverTimestamp(),
  });
}
