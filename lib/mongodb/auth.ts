import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import { connectDB } from "./config";
import { UserModel } from "./models/User";
import type { User, UserRole } from "@/types";
import { generateId } from "@/lib/utils";
import { JWT_SECRET, JWT_EXPIRE } from "./config";

// ─── JWT Token ────────────────────────────────────────────
export function createToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    return decoded;
  } catch {
    return null;
  }
}

// ─── Password Hashing ────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

// ─── Authentication Functions ────────────────────────────

export async function loginWithEmail(email: string, password: string): Promise<{ user: User; token: string }> {
  await connectDB();

  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error("Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.");
  }

  const passwordMatch = await comparePassword(password, user.password);
  if (!passwordMatch) {
    throw new Error("Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.");
  }

  if (!user.isActive) {
    throw new Error("Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ Admin.");
  }

  const token = createToken(String(user._id));
  const { password: _, ...userWithoutPassword } = user.toObject();
  return {
    user: { id: String(user._id), ...userWithoutPassword } as User,
    token,
  };
}

export async function loginWithGoogle(googleUser: {
  email: string;
  name: string;
  picture?: string;
}): Promise<{ user: User; token: string }> {
  await connectDB();

  let user = await UserModel.findOne({ email: googleUser.email.toLowerCase() });

  if (!user) {
    // Auto-create guest account for first-time Google login
    const userId = generateId("u");
    const dummyPassword = await hashPassword(Math.random().toString());
    user = new UserModel({
      _id: userId,
      email: googleUser.email.toLowerCase(),
      password: dummyPassword,
      name: googleUser.name,
      role: "guest",
      avatar: googleUser.picture,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    await user.save();
  }

  const token = createToken(String(user._id));
  const { password: _, ...userWithoutPassword } = user.toObject();
  return {
    user: { id: String(user._id), ...userWithoutPassword } as User,
    token,
  };
}

export async function createUserAccount(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  department?: string
): Promise<{ user: User; token: string }> {
  await connectDB();

  const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error("Email này đã được đăng ký. Vui lòng đăng nhập.");
  }

  const userId = generateId("u");
  const hashedPassword = await hashPassword(password);

  const newUser = new UserModel({
    _id: userId,
    email: email.toLowerCase(),
    password: hashedPassword,
    name,
    role,
    department,
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  await newUser.save();

  const token = createToken(String(newUser._id));
  const { password: _, ...userWithoutPassword } = newUser.toObject();
  return {
    user: { id: String(newUser._id), ...userWithoutPassword } as User,
    token,
  };
}

export async function getUser(userId: string): Promise<User | null> {
  await connectDB();
  const user = await UserModel.findById(userId);
  if (!user) return null;
  const { password: _, ...userWithoutPassword } = user.toObject();
  return { id: String(user._id), ...userWithoutPassword } as User;
}

export async function saveUser(user: Partial<User> & { id: string; password?: string }): Promise<void> {
  await connectDB();
  const { id, password, ...updateData } = user;
  await UserModel.findByIdAndUpdate(id, { ...updateData, updatedAt: new Date().toISOString() });
}

// ─── Password change (user-initiated) ────────────────────
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  await connectDB();

  const user = await UserModel.findById(userId);
  if (!user) throw new Error("Không tìm thấy tài khoản.");

  if (newPassword.length < 6) {
    throw new Error("Mật khẩu mới tối thiểu 6 ký tự.");
  }

  const match = await comparePassword(oldPassword, user.password);
  if (!match) throw new Error("Mật khẩu hiện tại không đúng.");

  const same = await comparePassword(newPassword, user.password);
  if (same) throw new Error("Mật khẩu mới phải khác mật khẩu hiện tại.");

  user.password = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.passwordUpdatedAt = new Date().toISOString();
  await user.save();
}

// ─── Admin reset password — sets a temp password + forces change at next login ──
export async function adminResetPassword(
  userId: string,
  tempPassword: string
): Promise<void> {
  await connectDB();

  if (tempPassword.length < 6) {
    throw new Error("Mật khẩu tạm tối thiểu 6 ký tự.");
  }

  const user = await UserModel.findById(userId);
  if (!user) throw new Error("Không tìm thấy tài khoản.");

  user.password = await hashPassword(tempPassword);
  user.mustChangePassword = true;
  user.passwordUpdatedAt = new Date().toISOString();
  await user.save();
}
