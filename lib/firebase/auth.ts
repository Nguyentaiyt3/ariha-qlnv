import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  User as FirebaseUser,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { getFirebaseAuth } from "./config";
import { saveUser, getUser } from "./firestore";
import type { User, UserRole } from "@/types";
import { generateId } from "@/lib/utils";

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/calendar");

function authErrorMessage(err: unknown): string {
  if (!(err instanceof FirebaseError)) return "Thao tác thất bại. Vui lòng thử lại.";
  switch (err.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.";
    case "auth/email-already-in-use":
      return "Email này đã được đăng ký. Vui lòng đăng nhập.";
    case "auth/weak-password":
      return "Mật khẩu quá yếu. Vui lòng dùng ít nhất 6 ký tự.";
    case "auth/invalid-email":
      return "Địa chỉ email không hợp lệ.";
    case "auth/user-disabled":
      return "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ Admin.";
    case "auth/too-many-requests":
      return "Quá nhiều lần thử. Vui lòng chờ vài phút rồi thử lại.";
    case "auth/network-request-failed":
      return "Lỗi kết nối mạng. Vui lòng kiểm tra internet.";
    case "auth/popup-closed-by-user":
      return "Cửa sổ đăng nhập đã bị đóng. Vui lòng thử lại.";
    default:
      return `Đăng nhập thất bại (${err.code}).`;
  }
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const user = await getUser(cred.user.uid);
    if (!user) throw new Error("Tài khoản chưa được tạo trong hệ thống. Vui lòng liên hệ HR/Admin.");
    return user;
  } catch (err) {
    if (err instanceof Error && !("code" in err)) throw err; // re-throw non-Firebase errors (e.g. the "not in system" message)
    throw new Error(authErrorMessage(err));
  }
}

export async function loginWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  let cred;
  try {
    cred = await signInWithPopup(auth, googleProvider);
  } catch (err) {
    throw new Error(authErrorMessage(err));
  }
  const fbUser = cred.user;

  let user = await getUser(fbUser.uid);
  if (!user) {
    // Auto-create guest account for first-time Google login
    user = {
      id: fbUser.uid,
      email: fbUser.email!,
      name: fbUser.displayName || fbUser.email!,
      role: "guest",
      avatar: fbUser.photoURL || undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await saveUser(user);
  }
  return user;
}

export async function logout(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export function onAuthChange(callback: (firebaseUser: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

export async function createUserAccount(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  department?: string
): Promise<User> {
  const auth = getFirebaseAuth();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    const user: User = {
      id: cred.user.uid,
      email,
      name,
      role,
      department,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await saveUser(user);
    return user;
  } catch (err) {
    if (err instanceof Error && !("code" in err)) throw err;
    throw new Error(authErrorMessage(err));
  }
}
