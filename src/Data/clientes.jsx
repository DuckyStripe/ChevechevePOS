import { fakerES } from '@faker-js/faker';

// Generar un cliente falso
const generateFakeClient = () => ({
  id: fakerES.number.int({ min: 1, max: 1000 }), // ID único
  CustomerName: fakerES.person.fullName(), // Nombre completo
  CustomerEmail: fakerES.internet.email(), // Correo electrónico
  CustomerPhone: fakerES.phone.number('+52 55# ### ###'), // Número de teléfono
  CustomerAddress: fakerES.address.streetAddress() // Dirección
});

// Generar una lista de clientes falsos
const clientes = Array.from({ length: 50 }, generateFakeClient);

export const fetchClientes = async () => {
  // Simula un retardo de red con una promesa
  await new Promise((r) => setTimeout(r, 500)); // Simula un retraso de 500ms
  return clientes;
};
