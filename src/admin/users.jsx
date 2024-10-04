import React , { useState, useEffect } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { Link } from "react-router-dom";
import ImageWithBasePath from "../core/img/imagewithbasebath";
import { ChevronUp } from "feather-icons-react/build/IconComponents";
import { setToogleHeader } from "../core/redux/action";
import { useDispatch, useSelector } from "react-redux";
import {
  PlusCircle,
} from "react-feather";
import withReactContent from "sweetalert2-react-content";
import Swal from "sweetalert2";
import Table from "../core/pagination/datatable";
import AddUsers from "../core/modals/usermanagement/addusers";
import EditUser from "../core/modals/usermanagement/edituser";
import {fetchUsers} from "../Data/Inventario/users"

import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

const Users = () => {
  const [dataSource, setDataSource] = useState([]);
  const dispatch = useDispatch();
  const data = useSelector((state) => state.toggle_header);

  useEffect(() => {
    const initializeData = async () => {
      const users = await fetchUsers();
      setDataSource(users);
    };
    initializeData();
  }, []);
  const handlePdfDownload = () => {
    const doc = new jsPDF({ orientation: "landscape" });
  
    // Añadir título y metadatos
    doc.setFontSize(16);
    doc.text("Lista de Usuarios", 20, 10);
    doc.setFontSize(10);
    doc.text("Generado desde la aplicación de Gestión de Usuarios", 20, 15);
  
    // Define las columnas basadas en la estructura de la tabla
    const columns = [
      { header: "Nombre", dataKey: "username" },
      { header: "Usuario", dataKey: "user" },
      { header: "Teléfono", dataKey: "phone" },
      { header: "Correo", dataKey: "email" },
      { header: "Rol", dataKey: "role" },
      { header: "Fecha Creación", dataKey: "createdon" },
      { header: "Estatus", dataKey: "status" }
    ];
  
    // Usa autotable para agregar los datos de los usuarios al documento
    doc.autoTable({
      head: [columns.map((col) => col.header)],
      body: dataSource.map((user) => columns.map((col) => user[col.dataKey])),
      startY: 40,
      margin: { top: 20 },
      styles: {
        fontSize: 8,
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 30 },
        2: { cellWidth: 20 },
        3: { cellWidth: 40 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 20 },
      },
      theme: 'grid'
    });
  
    // Guarda el PDF
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10);
    const fileName = `Lista_Usuarios_${formattedDate}.pdf`;
    doc.save(fileName);
  };
  
  const handleExcelExport = () => {
    // Define encabezados para la hoja de cálculo
    const headers = ["Nombre", "Usuario", "Teléfono", "Correo", "Rol", "Fecha Creación", "Estatus"];
  
    // Prepara los datos para la hoja de cálculo
    const usersData = dataSource.map(user => [
      user.username,
      user.user,
      user.phone,
      user.email,
      user.role,
      user.createdon,
      user.status
    ]);
  
    // Combina encabezados y datos
    const sheetData = [
      ["Lista de Usuarios"],
      ["Generado desde la aplicación de Gestión de Usuarios"],
      [],
      headers,
      ...usersData
    ];
  
    // Crea la hoja de cálculo
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Usuarios");
  
    // Guarda el archivo Excel
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10);
    const fileName = `Lista_Usuarios_${formattedDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };
  


  const handlePrint = () => {
    window.print();
    console.log("Contenido impreso");
  };

  const columns = [
    {
      title: "Nombre",
      dataIndex: "username",
      render: (text) => (
        <span>
          <div>
            {text}
          </div>
        </span>
      ),
      sorter: (a, b) => a.username.length - b.username.length,
    },
    {
      title: "Usuario",
      dataIndex: "user",
      render: (text) => (
        <span>
          <div>
            {text}
          </div>
        </span>
      ),
      sorter: (a, b) => a.username.length - b.username.length,
    },
    {
      title: "Telefono",
      dataIndex: "phone",
      sorter: (a, b) => a.phone.length - b.phone.length,
    },
    {
      title: "Correo",
      dataIndex: "email",
      sorter: (a, b) => a.email.length - b.email.length,
    },
    {
      title: "Rol",
      dataIndex: "role",
      sorter: (a, b) => a.role.length - b.role.length,
    },
    {
      title: "Fecha Creación",
      dataIndex: "createdon",
      sorter: (a, b) => a.createdon.length - b.createdon.length,
    },
    {
      title: "Estatus",
      dataIndex: "status",
      render: (text) => (
        <div>
          {text === "Active" && (
            <span className="badge badge-linesuccess">{text}</span>
          )}
          {text === "Inactive" && (
            <span className="badge badge-linedanger">{text}</span>
          )}
        </div>
      ),
      sorter: (a, b) => a.status.length - b.status.length,
    },
    {
      title: "Acciones",
      dataIndex: "actions",
      key: "actions",
      render: () => (
        <div className="action-table-data">
          <div className="edit-delete-action">
            <Link className="me-2 p-2" to="#">
              <i
                data-feather="eye"
                className="feather feather-eye action-eye"
              ></i>
            </Link>
            <Link
              className="me-2 p-2"
              to="#"
              data-bs-toggle="modal"
              data-bs-target="#edit-units"
            >
              <i data-feather="edit" className="feather-edit"></i>
            </Link>
            <Link className="confirm-text p-2" to="#">
              <i
                data-feather="trash-2"
                className="feather-trash-2"
                onClick={showConfirmationAlert}
              ></i>
            </Link>
          </div>
        </div>
      ),
    },
  ];

  const renderTooltip = (props) => (
    <Tooltip id="pdf-tooltip" {...props}>
      Pdf
    </Tooltip>
  );
  const renderExcelTooltip = (props) => (
    <Tooltip id="excel-tooltip" {...props}>
      Excel
    </Tooltip>
  );
  const renderPrinterTooltip = (props) => (
    <Tooltip id="printer-tooltip" {...props}>
      Printer
    </Tooltip>
  );
  const renderCollapseTooltip = (props) => (
    <Tooltip id="refresh-tooltip" {...props}>
      Collapse
    </Tooltip>
  );


  const MySwal = withReactContent(Swal);

  const showConfirmationAlert = () => {
    MySwal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      showCancelButton: true,
      confirmButtonColor: "#00ff00",
      confirmButtonText: "Yes, delete it!",
      cancelButtonColor: "#ff0000",
      cancelButtonText: "Cancel",
    }).then((result) => {
      if (result.isConfirmed) {
        MySwal.fire({
          title: "Deleted!",
          text: "Your file has been deleted.",
          className: "btn btn-success",
          confirmButtonText: "OK",
          customClass: {
            confirmButton: "btn btn-success",
          },
        });
      } else {
        MySwal.close();
      }
    });
  };
  return (
    <div>
      <div className="page-wrapper">
        <div className="content">
          <div className="page-header">
            <div className="add-item d-flex">
              <div className="page-title">
                <h4>Lista de Usuarios</h4>
                <h6>Gestiona los usuarios de tu sistema</h6>
              </div>
            </div>
            <ul className="table-top-head">
              <li>
              <OverlayTrigger placement="top" overlay={renderTooltip}>
                <Link onClick={handlePdfDownload}>
                  <ImageWithBasePath src="assets/img/icons/pdf.svg" alt="img" />
                </Link>
              </OverlayTrigger>
              </li>
              <li>
              <OverlayTrigger placement="top" overlay={renderExcelTooltip}>
                <Link onClick={handleExcelExport}>
                  <ImageWithBasePath
                    src="assets/img/icons/excel.svg"
                    alt="img"
                  />
                </Link>
              </OverlayTrigger>
              </li>
              <li>
              <OverlayTrigger placement="top" overlay={renderPrinterTooltip}>
                <Link onClick={handlePrint}>
                  <i data-feather="printer" className="feather-printer" />
                </Link>
              </OverlayTrigger>
              </li>
              <li>
                <OverlayTrigger placement="top" overlay={renderCollapseTooltip}>
                  <Link
                    data-bs-toggle="tooltip"
                    data-bs-placement="top"
                    id="collapse-header"
                    className={data ? "active" : ""}
                    onClick={() => {
                      dispatch(setToogleHeader(!data));
                    }}
                  >
                    <ChevronUp />
                  </Link>
                </OverlayTrigger>
              </li>
            </ul>
            <div className="page-btn">
              <a
                to="#"
                className="btn btn-added"
                data-bs-toggle="modal"
                data-bs-target="#add-units"
              >
                <PlusCircle className="me-2" />
                Agregar Usuario
              </a>
            </div>
          </div>
          {/* /product list */}
          <div className="card table-list-card">
            <div className="card-body">
              <div className="table-top">
                <div className="search-set">
                  <div className="search-input">
                    <input
                      type="text"
                      placeholder="Search"
                      className="form-control form-control-sm formsearch"
                    />
                    <Link to className="btn btn-searchset">
                      <i data-feather="search" className="feather-search" />
                    </Link>
                  </div>
                </div>
              </div>
              <div className="table-responsive">
                <Table columns={columns} dataSource={dataSource} />
              </div>
            </div>
          </div>
          {/* /product list */}
        </div>
      </div>
      <AddUsers />
      <EditUser />
    </div>
  );
};

export default Users;
