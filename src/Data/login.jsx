const mockLogin = {
    success: true,
    message: "Autenticación exitosa",
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZmlyc3ROYW1lIjoiTHVpcyIsImxhc3ROYW1lIjoiQ2FuY2hvbGEiLCJyb2xlIjoiU3VwZXIgQWRtaW4iLCJpYXQiOjE3Mjc3MzY3MDR9.v7tZypqm1S-hLZK3Z35_E3fMPVPhEjf0M0PMpMFON1M",
    user: {
      id: 1,
      firstName: "Luis",
      lastName: "Canchola",
      role: "Super Admin"
    }
  };
  
  const mockLoginError = {
    success: false,
    message: "Credenciales inválidas"
  };
  
  export const loginSimulation = async (username, password) => {
    // Simula una espera por respuesta del servidor
    await new Promise((r) => setTimeout(r, 500)); // Simula retardo de 500ms
  
    if (username === "admin" && password === "password") {
      return mockLogin;
    } else {
      return mockLoginError;
    }
  };
  