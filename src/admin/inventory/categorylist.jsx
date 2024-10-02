import React, { useState, useEffect } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { Link } from "react-router-dom";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import {
  
  Filter,
  PlusCircle
} from "feather-icons-react/build/IconComponents";
import AddCategoryList from "../../core/modals/inventory/addcategorylist";
import EditCategoryList from "../../core/modals/inventory/editcategorylist";
import Table from "../../core/pagination/datatable";
import {
  fetchCategory,
  } from "../../Data/Inventario/category"; // I
import withReactContent from "sweetalert2-react-content";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

const CategoryList = () => {
  const [dataSource, setDataSource] = useState([]);
  const [searchValue, setSearchValue] = useState(""); // Estado para el término de búsqueda
  const [filteredData, setFilteredData] = useState([]); // Para almacenar datos filtrados
  const [selectedCategory, setSelectedCategory] = useState(null); // Estado para la categoría seleccionada

  useEffect(() => {
    // Esta función se ejecuta cuando el componente se monta
    const loadInitialData = async () => {
      const products = await fetchCategory(); // Cargar por defecto los productos con bajo inventario
      setDataSource(products);
      setFilteredData(products);
    };

    loadInitialData();
  }, []);
  const handleEditClick = (category) => {
    setSelectedCategory(category); // Establecer la categoría seleccionada
  };

  const handleSearchChange = (event) => {
    const value = event.target.value.toLowerCase();
    setSearchValue(value);
    console.log(value);
    
    // Filtramos las categorías en base al nombre de la categoría actual
    const filtered = dataSource.filter((category) =>
      category.category.toLowerCase().includes(value)
    );
  
    console.log(filtered);
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
      title: "Categoria",
      dataIndex: "category",
      sorter: (a, b) => a.category.length - b.category.length,
    },
    {
      title: "Descripcion",
      dataIndex: "categoryslug",
      sorter: (a, b) => a.categoryslug.length - b.categoryslug.length,
    },
    {
      title: "Fecha Creación",
      dataIndex: "createdon",
      sorter: (a, b) => a.createdon.length - b.createdon.length,
    },
    {
      title: "Estatus",
      dataIndex: "status",
      sorter: (a, b) => a.status.length - b.status.length,
      render: (text) => (
        <span
          className={`badge ${
            text === "Active" ? "badge-linesuccess" : "badge-bgdanger"
          }`}
        >
          {text}
        </span>
      ),
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
                onClick={showConfirmationAlert}
              ></i>
            </Link>
          </div>
        </div>
      ),
    },
  ];
  const MySwal = withReactContent(Swal);

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
    console.log("Contenido impreso");
  };


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
            <div className="page-title me-auto">
              <h4>Categorias</h4>
              <h6>Visualiza las categorias de tus productos</h6>
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
                Añadir Categoria
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
                      {/* <div className="card-body pb-0">
                        <div className="row">
                          <div className="col-lg-1 col-sm-6 col-12">
                            <div className="input-blocks"></div>
                          </div>
                          <div className="col-lg-2 col-sm-6 col-12">
                            <div className="input-blocks">
                              <StopCircle className="info-img" />
                              <Select
                                className="img-select"
                                classNamePrefix="react-select"
                                options={options.categories} // Asegúrate de usar 'categories', no 'category'
                                placeholder="Elegir Categoría"
                                onChange={handleSelectChange("category")} // Usa la clave correcta
                                value={
                                  options.categories?.find(
                                    (option) =>
                                      option.value === selectedFilters.category
                                  ) || null
                                }
                              />
                            </div>
                          </div>
                          <div className="col-lg-2 col-sm-6 col-12">
                            <div className="input-blocks">
                              <GitMerge className="info-img" />
                              <Select
                                className="img-select"
                                classNamePrefix="react-select"
                                options={options.subCategories}
                                placeholder="Elegir Subcategoría"
                                onChange={handleSelectChange("subCategory")}
                                value={
                                  options.subCategories?.find(
                                    (option) =>
                                      option.value ===
                                      selectedFilters.subCategory
                                  ) || null
                                }
                              />
                            </div>
                          </div>
                          <div className="col-lg-2 col-sm-6 col-12">
                            <div className="input-blocks">
                              <StopCircle className="info-img" />
                              <Select
                                className="img-select"
                                classNamePrefix="react-select"
                                options={options.brands}
                                placeholder="Elegir Marca"
                                onChange={handleSelectChange("brand")}
                                value={
                                  options.brands?.find(
                                    (option) =>
                                      option.value === selectedFilters.brand
                                  ) || null
                                }
                              />
                            </div>
                          </div>
                          <div className="col-lg-2 col-sm-6 col-12">
                            <div className="input-blocks">
                              <i className="fas fa-money-bill info-img" />
                              <Select
                                className="img-select"
                                classNamePrefix="react-select"
                                options={options.prices}
                                placeholder="Elegir Precio"
                                onChange={handleSelectChange("price")}
                                value={
                                  options.prices?.find(
                                    (option) =>
                                      option.value === selectedFilters.price
                                  ) || null
                                }
                              />
                            </div>
                          </div>

                          <div className="col-lg-1 col-sm-6 col-12">
                            <div className="input-blocks">
                              <button
                                className="btn btn-filters ms-auto"
                                onClick={handleSearch}
                              >
                                <i
                                  data-feather="search"
                                  className="feather-search"
                                />
                                Buscar
                              </button>
                            </div>
                          </div>
                          <div className="col-lg-1 col-sm-6 col-12">
                            <div className="input-blocks">
                              <button
                                className="btn btn-filters ms-auto" // Añade alguna clase CSS si necesitas estilos específicos
                                onClick={resetFilters}
                              >
                                <i
                                  data-feather="rotate-ccw" // Usa un icono adecuado según tu necesidad, aquí como ejemplo
                                  className="feather-rotate-ccw"
                                />
                                Limpiar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div> */}
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
      <AddCategoryList />
      <EditCategoryList categoryData={selectedCategory}  />
    </div>
  );
};

export default CategoryList;
