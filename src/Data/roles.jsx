const MockRoles = [{
    id:3,
    rolename: "Admin",
    createdon: "17 Enero 2024",
    CreateBy: "lcanchola",
  }];
  

  export const fetchUserData = async () => {
    // Aquí puedes simular una espera similar a una llamada a la API
    await new Promise((r) => setTimeout(r, 500)); // Simula un retraso de 500ms
    return MockRoles;
  };