import React, { useState, useEffect } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { Link } from "react-router-dom";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import {

  Filter,
  PlusCircle
} from "feather-icons-react/build/IconComponents";
import AddSubcategory from "../../core/modals/inventory/addsubcategory";
import EditSubcategories from "./editsubcategories";
import Table from "../../core/pagination/datatable";
import {
  fetchSubCategory,
  } from "../../Data/Inventario/subcategory"; // I
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import axios from 'axios';
import Cookies from 'js-cookie';

const SubCategories = () => {
  const [dataSource, setDataSource] = useState([]);
  const [searchValue, setSearchValue] = useState(""); // Estado para el término de búsqueda
  const [filteredData, setFilteredData] = useState([]); // Para almacenar datos filtrados
  const [selectedSubCategory, setSelectedSubCategory] = useState(null); // Estado para la categoría seleccionada
  
  const loadInitialData = async () => {
    const products = await fetchSubCategory(); // Cargar por defecto los productos con bajo inventario
    setDataSource(products);
    setFilteredData(products);
  };
  useEffect(() => {
    // Esta función se ejecuta cuando el componente se monta

    loadInitialData();
  }, []);
  const handleEditClick = (category) => {
    setSelectedSubCategory(category); // Establecer la categoría seleccionada
  };

  const handleSearchChange = (event) => {
    const value = event.target.value.toLowerCase();
    setSearchValue(value);

    // Filtramos las categorías en base al nombre de la categoría actual
    const filtered = dataSource.filter((category) =>
      category.category.toLowerCase().includes(value)
    );

    setFilteredData(filtered);
  };


  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const toggleFilterVisibility = () => {
    setIsFilterVisible((prevVisibility) => !prevVisibility);
  };
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
  const columns = [
    {
      title: "Categoria Padre",
      dataIndex: "CategoriaPadre",
      sorter: (a, b) => a.CategoriaPadre.length - b.CategoriaPadre.length,
    },
    {
      title: "Subcategoria",
      dataIndex: "valor",
      sorter: (a, b) => a.valor.length - b.valor.length,
    },
    {
      title: "Descripcion",
      dataIndex: "etiqueta",
      sorter: (a, b) => a.etiqueta.length - b.etiqueta.length,
    },
    {
      title: "Creador",
      dataIndex: "UsuarioCreador",
      sorter: (a, b) => a.UsuarioCreador.length - b.UsuarioCreador.length,
    },
    {
      title: "Fecha Creación",
      dataIndex: "fechainsercion",
      sorter: (a, b) => a.fechainsercion.length - b.fechainsercion.length,
    },
    {
      title: "Estatus",
      dataIndex: "estatus",
      sorter: (a, b) => a.estatus - b.estatus,
      render: (text) => {
        // Convertir el estatus a texto legible
        const statusText = text === 1 ? "Activo" : "Inactivo";
        // Determinar la clase CSS en función del estatus
        const badgeClass = text === 1 ? "badge-linesuccess" : "badge-bgdanger";

        return (
          <span className={`badge ${badgeClass}`}>
            {statusText}
          </span>
        );
      },
    },
    {
      title: "Acciones",
      dataIndex: "actions",
      key: "actions",
      render:  (_, category) => (
        <div className="action-table-data">
          <div className="edit-delete-action">
            <Link
              className="me-2 p-2"
              to="#"
              data-bs-toggle="modal"
              data-bs-target="#edit-category"
              onClick={() => handleEditClick(category)}
            >
              <i data-feather="edit" className="feather-edit"></i>
            </Link>
            <Link className="confirm-text p-2" to="#">
              <i
                data-feather="trash-2"
                className="feather-trash-2"
                onClick={() =>showConfirmationAlert(category.id)}
              ></i>
            </Link>
          </div>
        </div>
      ),
    },
  ];
  const handlePdfDownload = () => {
    const columns = [
      { title: "ID", dataIndex: "key" },
      { title: "Categoria", dataIndex: "category" },
      { title: "Descripcion", dataIndex: "categoryslug" },
      { title: "Fecha Creacion", dataIndex: "createdon" },
      { title: "Estatus", dataIndex: "status" }
    ];

    // Obtiene la fecha actual para incluir en el nombre del archivo
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // Crea un nuevo documento PDF
    const doc = new jsPDF();

    // Usa autotable para agregar la tabla al documento
    doc.autoTable({
      head: [columns.map(col => col.title)],
      body: dataSource.map(row => columns.map(col => row[col.dataIndex])),
      styles: { halign: 'center' },
      headStyles: { fillColor: [233, 30, 99] }
    });

    // Guarda el PDF con el nombre que incluye la fecha
    const fileName = `Categorias_${formattedDate}.pdf`;
    doc.save(fileName);
  };

  const handleExcelExport = () => {
    // Define las columnas que quieres usar en el archivo Excel
    const columns = [
      { title: "ID", dataIndex: "key" },
      { title: "Categoria", dataIndex: "category" },
      { title: "Descripcion", dataIndex: "categoryslug" },
      { title: "Fecha Creacion", dataIndex: "createdon" },
      { title: "Estatus", dataIndex: "status" }
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
    const fileName = `Categorias_${formattedDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handlePrint = () => {
    window.print();
  };


  const showConfirmationAlert = async (id) => {
    const formData = new FormData();
    formData.append("id", id);
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Esta acción no se puede revertir",
      showCancelButton: true,
      confirmButtonColor: "#00ff00",
      confirmButtonText: `Sí, bórralo`,
      cancelButtonColor: "#ff0000",
      cancelButtonText: "Cancelar",
    });
  
    if (result.isConfirmed) {
      const token = Cookies.get('authToken');
      const config = {
        method: 'post',  
        url: `https://cheveposapi.codelabs.com.mx/Endpoints/Delete/DeleteSubcategoria.php`, // Suponiendo este endpoint
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        data:formData
      };
  
      try {
        const response = await axios.request(config);
  
        if (response.data.success) {
          loadInitialData();
          await Swal.fire({
            title: "¡Eliminado!",
            text: "Subcategoria ha sido eliminado.",
            icon: 'success',
            confirmButtonText: "OK",
            customClass: {
              confirmButton: "btn btn-success",
            },
          });
        } else {
          await Swal.fire({
            title: "Error",
            text: response.data.message,
            icon: 'error',
            confirmButtonText: "OK",
          });
        }
      } catch (error) {
        await Swal.fire({
          title: "Error",
          text: "Hubo un problema al intentar eliminar la subcategoria.",
          icon: 'error',
          confirmButtonText: "OK",

        });
        console.error("Error al eliminar el subcategoria:", error);
      }
    }
  };
  return (
    <div>
      <div className="page-wrapper">
        <div className="content">
          <div className="page-header">
            <div className="page-title me-auto">
              <h4>Subcategorias</h4>
              <h6>Visualiza las subcategorias de tus productos</h6>
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
          </ul>
          </div>
          <div className="table-tab">
            <div className="tab-content" id="pills-tabContent">
              <div
                className="tab-pane fade show active"
                id="pills-home"
                role="tabpanel"
                aria-labelledby="pills-home-tab"
              >
                {/* /product list */}
                <div className="card table-list-card">
                  <div className="card-body">
                    <div className="table-top">
                      <div className="search-set">
                        <div className="search-input">
                          <input
                            type="text"
                            placeholder="Buscar"
                            className="form-control form-control-sm formsearch"
                            value={searchValue}
                            onChange={handleSearchChange}
                          />
                          <Link to className="btn btn-searchset">
                            <i
                              data-feather="search"
                              className="feather-search"
                            />
                          </Link>
                        </div>
                      </div>
                      <div className="search-path">
                      <div className="page-btn">
                      <Link
                to="#"
                className="btn btn-added"
                data-bs-toggle="modal"
                data-bs-target="#add-category"
              >
                <PlusCircle className="me-2" />
                Añadir Subcategoria
              </Link>
            </div>
                      </div>
                    </div>
                    {/* /Filter */}
                    <div
                      className={`card${isFilterVisible ? " visible" : ""}`}
                      id="filter_inputs"
                      style={{ display: isFilterVisible ? "block" : "none" }}
                    >
                      {" "}
                    </div>
                    {/* /Filter */}
                    <div className="table-responsive">
                      <Table columns={columns} dataSource={filteredData} />
                    </div>
                  </div>
                </div>
                {/* /product list */}
              </div>
              <div
                className="tab-pane fade"
                id="pills-profile"
                role="tabpanel"
                aria-labelledby="pills-profile-tab"
              >
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
                            <i
                              data-feather="search"
                              className="feather-search"
                            />
                          </Link>
                        </div>
                      </div>
                      <div className="search-path">
                        <Link
                          className={`btn btn-filter ${
                            isFilterVisible ? "setclose" : ""
                          }`}
                          id="filter_search"
                        >
                          <Filter
                            className="filter-icon"
                            onClick={toggleFilterVisibility}
                          />
                          <span onClick={toggleFilterVisibility}>
                            <ImageWithBasePath
                              src="assets/img/icons/closes.svg"
                              alt="img"
                            />
                          </span>
                        </Link>
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
          </div>
        </div>
      </div>
      <AddSubcategory />
      <EditSubcategories SubcategoryData={selectedSubCategory} />
    </div>
  );
};

export default SubCategories;
