import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // send/receive the session cookie
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error ?? err.message ?? "Something went wrong";
    return Promise.reject(new Error(message));
  }
);
