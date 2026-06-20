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
import { getFirebaseAuth } from "./config";
import { saveUser, getUser } from "./firestore";
import type { User, UserRole } from "@/types";
import { generateId } from "@/lib/utils";

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/calendar");

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = await getUser(cred.user.uid);
  if (!user) throw new Error("Tài khoản chưa được tạo trong hệ thống. Vui lòng liên hệ HR/Admin.");
  return user;
}

export async function loginWithGoogle(): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await signInWithPopup(auth, googleProvider);
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
}
