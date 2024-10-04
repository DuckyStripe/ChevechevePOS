import { fakerES } from '@faker-js/faker';
const roles = [
  { value: 'Elegir Uno', label: 'Elegir Uno' },
  { value: 'Administrador', label: 'Administrador' },
  { value: 'Usuario', label: 'Usuario' },
];
// Función para generar un usuario falso
const generateFakeUser = () => {
  return {
    username: fakerES.person.fullName(),   
    user: fakerES.internet.userName(),        // Nombre de usuario
    phone: fakerES.phone.number('+52 55# ### ###'), // Número de teléfono (formato aproximado de España)
    email: fakerES.internet.email(),              // Correo electrónico
    role: fakerES.helpers.arrayElement(['Admin', 'User']), // Rol aleatorio
    createdon: fakerES.date.past().toLocaleDateString(), // Fecha de creación
    status: fakerES.helpers.arrayElement(['Active', 'Inactive']), // Estatus aleatorio
    actions: null // Este campo será gestionado por el renderizador de tu tabla
  };
};

// Genera una lista de usuarios falsos
export const mockSales = Array.from({ length: 50 }, generateFakeUser);

export const fetchUsers = async () => {
  // Simula un retardo de red con una promesa
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockSales;
};
export const fetchRolesAvaible= async () => {
  // Simula un retardo de red con una promesa
  await new Promise((resolve) => setTimeout(resolve, 500));
  return roles;
};
