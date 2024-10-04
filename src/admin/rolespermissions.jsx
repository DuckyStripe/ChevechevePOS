import React, { useState, useEffect } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import ImageWithBasePath from "../core/img/imagewithbasebath";
import { Link } from "react-router-dom";
import { PlusCircle } from "react-feather";
import withReactContent from "sweetalert2-react-content";
import Swal from "sweetalert2";
import Table from "../core/pagination/datatable";
import AddRole from "../core/modals/usermanagement/addrole";
import EditRole from "../core/modals/usermanagement/editrole";
import { fetchUserData } from "../Data/roles";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
const RolesPermissions = () => {
  const [dataSource, setDataSource] = useState([]);
  const [selectedRol, setselectedRol] = useState(null); // Estado para la categoría seleccionada
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const initializeData = async () => {
      const users = await fetchUserData();
      console.log(users);
      setDataSource(users);
    };
    initializeData();
  }, []);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  const filteredData = dataSource.filter((item) =>
    item.rolename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePdfDownload = () => {
    const columns = [
      { header: "ID", dataKey: "id" },
      { header: "Rol", dataKey: "rolename" },
      { header: "Creado por", dataKey: "CreateBy" }, // Ajusta según tu estructura
      { header: "Fecha Creacion", dataKey: "createdon" } // Ajusta según tu estructura
    ];

    // Obtiene la fecha actual para incluir en el nombre del archivo
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // Crea un nuevo documento PDF
    const doc = new jsPDF();

    // Usa autotable para agregar la tabla al documento
    doc.autoTable({
      head: [columns.map((col) => col.header)], // Usando los headers correctos
      body: dataSource.map((row) => columns.map((col) => row[col.dataKey])), // Usando los dataKeys para extraer valores
      styles: { halign: "center" }, // Opcional: centrar el contenido
      headStyles: { fillColor: [233, 30, 99] } // Opcional: color de la cabecera
    });

    // Guarda el PDF con el nombre que incluye la fecha
    const fileName = `Roles_${formattedDate}.pdf`;
    doc.save(fileName);
  };

  const handleExcelExport = () => {
    // Define las columnas que quieres usar en el archivo Excel
    const columns = [
      { title: "ID", dataIndex: "id" },
      { title: "Rol", dataIndex: "rolename" },
      { title: "Creado por", dataIndex: "createdon" },
      { title: "Fecha Creacion", dataIndex: "CreateBy" }
    ];

    // Extrae las filas de datos basadas en dataSource
    const data = dataSource.map((item) =>
      columns.map((col) => item[col.dataIndex])
    );

    // Prepara los encabezados del archivo Excel
    const headers = columns.map((col) => col.title);

    // Combina los encabezados y los datos
    const sheetData = [headers, ...data];

    // Crea la hoja de cálculo
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Crea y descarga el archivo Excel
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // Incluye la fecha en el nombre del archivo
    const fileName = `Roles_${formattedDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handleEditClick = (id) => {
    console.log("ID ROL", id.id, "Nombre ROl", id.rolename);
    setselectedRol(id); // Establecer la categoría seleccionada
  };
  const columns = [
    {
      title: "Rol",
      dataIndex: "rolename",
      sorter: (a, b) => a.rolename.length - b.rolename.length
    },
    {
      title: "Fecha Creación",
      dataIndex: "createdon",
      sorter: (a, b) => a.createdon.length - b.createdon.length
    },
    {
      title: "Creado por",
      dataIndex: "CreateBy",
      sorter: (a, b) => a.CreateBy.length - b.CreateBy.length
    },
    {
      title: "Acciones",
      dataIndex: "actions",
      key: "actions",
      render: (_, id) => (
        <div className="action-table-data">
          <div className="edit-delete-action">
            <Link
              className="me-2 p-2"
              to="#"
              data-bs-toggle="modal"
              data-bs-target="#edit-units"
              onClick={() => handleEditClick(id)}
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
      )
    }
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

  const MySwal = withReactContent(Swal);

  const showConfirmationAlert = () => {
    MySwal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      showCancelButton: true,
      confirmButtonColor: "#00ff00",
      confirmButtonText: "Yes, delete it!",
      cancelButtonColor: "#ff0000",
      cancelButtonText: "Cancel"
    }).then((result) => {
      if (result.isConfirmed) {
        MySwal.fire({
          title: "Deleted!",
          text: "Your file has been deleted.",
          className: "btn btn-success",
          confirmButtonText: "OK",
          customClass: {
            confirmButton: "btn btn-success"
          }
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
                <h4>Roles &amp; Permisos</h4>
                <h6>Gestiona los roles</h6>
              </div>
            </div>
            <ul className="table-top-head">
              <li>
                <OverlayTrigger placement="top" overlay={renderTooltip}>
                  <Link onClick={handlePdfDownload}>
                    <ImageWithBasePath
                      src="assets/img/icons/pdf.svg"
                      alt="img"
                    />
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
                  <Link data-bs-toggle="tooltip" data-bs-placement="top">
                    <i data-feather="printer" className="feather-printer" />
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
                Añadir Rol
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
                      value={searchTerm}
                      onChange={handleSearchChange}
                    />
                    <Link to className="btn btn-searchset">
                      <i data-feather="search" className="feather-search" />
                    </Link>
                  </div>
                </div>
              </div>
              <div className="table-responsive">
                <Table columns={columns} dataSource={filteredData} />
              </div>
            </div>
          </div>
          {/* /product list */}
        </div>
      </div>
      <AddRole />
      <EditRole RolData={selectedRol} />
    </div>
  );
};

export default RolesPermissions;
