import { User } from "../types";
import * as ProjectService from "./projectService";

const CURRENT_USER_KEY = "cosmo_current_user";
const ALL_USERS_KEY = "cosmo_all_users";
const ADMIN_EMAIL = "admin@cosmostudio.io";

// --- SIMULATED AUTH SERVICE ---

export const signup = (email: string, password_not_used: string): User => {
  let users: User[] = [];
  try {
    const raw = localStorage.getItem(ALL_USERS_KEY);
    users = raw ? JSON.parse(raw) : [];
  } catch (e) {
    users = [];
  }

  if (users.find(u => u.email === email)) {
    throw new Error("User with this email already exists.");
  }

  const newUser: User = {
    id: `user_${crypto.randomUUID()}`,
    email,
    role: email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user',
  };

  users.push(newUser);
  localStorage.setItem(ALL_USERS_KEY, JSON.stringify(users));
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
  
  return newUser;
};

export const login = (email: string, password_not_used: string): User => {
  let users: User[] = [];
  try {
    const raw = localStorage.getItem(ALL_USERS_KEY);
    users = raw ? JSON.parse(raw) : [];
  } catch (e) {
    throw new Error("No users found. Please sign up.");
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    throw new Error("Invalid email or password.");
  }

  // Ensure role is correctly assigned on login
  user.role = email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';

  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  return user;
};

export const logout = (): void => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

export const getCurrentUser = (): User | null => {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

export const getAllUsers = (): User[] => {
    try {
      const raw = localStorage.getItem(ALL_USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
};

export const deleteUser = async (userIdToDelete: string): Promise<void> => {
    let users = getAllUsers();
    const userToDelete = users.find(u => u.id === userIdToDelete);
    if (!userToDelete) return;
  
    const currentUser = getCurrentUser();
    if (currentUser?.id === userIdToDelete) {
      throw new Error("Cannot delete your own account while logged in.");
    }
  
    // Cascade delete: projects and assets first
    await ProjectService.deleteAllProjectsForUser(userIdToDelete);
  
    // Then, remove the user from the user list
    users = users.filter(u => u.id !== userIdToDelete);
    localStorage.setItem(ALL_USERS_KEY, JSON.stringify(users));
};
