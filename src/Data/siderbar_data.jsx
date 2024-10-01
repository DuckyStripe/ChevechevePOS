import React from "react";

import * as Icon from "react-feather";

export const SidebarData = [
  {
    label: "Principal",
    submenuOpen: true,
    showSubRoute: false,
    submenuHdr: "Main",
    submenuItems: [
      {
        label: "Dashboard",
        icon: <Icon.Grid />,
        submenu: false,
        link: "/admin-dashboard" ,
        showSubRoute: false,

      },
      {
        label: "POS",
        link: "/pos",
        icon: <Icon.HardDrive />,
        showSubRoute: false,
        submenu: false,
      },
    ],
  },
  {
    label: "Inventario",
    submenuOpen: true,
    showSubRoute: false,
    submenuHdr: "Inventory",
    submenuItems: [
      {
        label: "Inventario",
        link: "/product-list",
        icon: <Icon.Box />,
        showSubRoute: false,
        submenu: false,
      },
      {
        label: "Agregar a Inventario",
        link: "/add-product",
        icon: <Icon.PlusSquare />,
        showSubRoute: false,
        submenu: false,
      },


      {
        label: "Ajustar Inventario",
        link: "/expired-products",
        icon: <Icon.Codesandbox />,
        showSubRoute: false,
        submenu: false,
      },
      {
        label: "Productos Bajos en Inventario",
        link: "/low-stocks",
        icon: <Icon.TrendingDown />,
        showSubRoute: false,
        submenu: false,
      },
      {
        label: "Categoria",
        link: "/category-list",
        icon: <Icon.Codepen />,
        showSubRoute: false,
        submenu: false,
      },
      {
        label: "SubCategoria",
        link: "/sub-categories",
        icon: <Icon.Speaker />,
        showSubRoute: false,
        submenu: false,
      }
    ],
  },
  {
    label: "Reportes",
    submenuOpen: true,
    showSubRoute: false,
    submenuHdr: "Reports",
    submenuItems: [
      {
        label: "Reporte de Ventas",
        link: "/sales-report",
        icon: <Icon.BarChart2 />,
        showSubRoute: false,
      },
      {
        label: "Reporte de Compras",
        link: "/purchase-report",
        icon: <Icon.PieChart />,
        showSubRoute: false,
      },
      {
        label: "Reporte inventario",
        link: "/inventory-report",
        icon: <Icon.Inbox />,
        showSubRoute: false,
      },
      {
        label: "Ganancias y perdidas",
        link: "/profit-loss-report",
        icon: <Icon.TrendingDown />,
        showSubRoute: false,
      },
    ],
  },
  {
    label: "Opciones",
    submenuOpen: true,
    submenuHdr: "Sales",
    submenu: false,
    showSubRoute: false,
    submenuItems: [
      {
        label: "Ventas",
        link: "/sales-list",
        icon: <Icon.ShoppingCart />,
        showSubRoute: false,
        submenu: false,
      },
      {
        label: "Gastos",
        link: "/purchase-list",
        icon: <Icon.ShoppingBag />,
        showSubRoute: false,
        submenu: false,
      },      {
        label: "Clientes",
        link: "/customers",
        icon: <Icon.User />,
        showSubRoute: false,
        submenu: false,
      },
    ],
  },
  {
    label: "Usuarios",
    submenuOpen: true,
    showSubRoute: false,
    submenuHdr: "User Management",
    submenuItems: [
      {
        label: "Users",
        link: "/users",
        icon: <Icon.UserCheck />,
        showSubRoute: false,
      },
      {
        label: "Roles & Permissions",
        link: "/roles-permissions",
        icon: <Icon.UserCheck />,
        showSubRoute: false,
      },
    ],
  },
];
