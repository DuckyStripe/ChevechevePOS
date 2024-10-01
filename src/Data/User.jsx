const mockUserData = {
  id: 1,
  firstName: "Luis",
  lastName: "Canchola",
  role: "Super Admin",
  isDeveloper: true
};

const mockNotifications = [
  {
    id: 1,
    icon: "delete.svg",
    user: "Luis",
    message: "New user signed up",
    time: "5 mins ago"
  },
  {
    id: 2,
    icon: "edit.svg",
    user: "Luis",
    message: "Server overload alert",
    time: "10 mins ago"
  }
];
export const fetchUserData = async () => {
  // Aquí puedes simular una espera similar a una llamada a la API
  await new Promise((r) => setTimeout(r, 500)); // Simula un retraso de 500ms
  return mockUserData;
};
export const fetchNotifications = async () => {
  await new Promise((r) => setTimeout(r, 500));
  return mockNotifications;
};
