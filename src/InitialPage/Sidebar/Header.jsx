import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FeatherIcon from "feather-icons-react";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
//import {   XCircle } from "react-feather"; //Settings, User,Search
// import { all_routes } from "../../Router/all_routes";
import { fetchUserData, fetchNotifications } from "../../Data/User";
import Cookies from 'js-cookie';

const Header = () => {
  // const route = all_routes;
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [toggle, SetToggle] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isElementVisible = (element) => {
    return element.offsetWidth > 0 || element.offsetHeight > 0;
  };
  useEffect(() => {
    const loadData = async () => {
      const userData = await fetchUserData();
      setUser(userData);
      
      const notificationsData = await fetchNotifications();
      setNotifications(notificationsData);
    };

    loadData();
  }, []);
  useEffect(() => {
    const handleMouseover = (e) => {
      e.stopPropagation();

      const body = document.body;
      const toggleBtn = document.getElementById("toggle_btn");

      if (
        body.classList.contains("mini-sidebar") &&
        isElementVisible(toggleBtn)
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener("mouseover", handleMouseover);

    return () => {
      document.removeEventListener("mouseover", handleMouseover);
    };
  }, []); 
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement ||
          document.mozFullScreenElement ||
          document.webkitFullscreenElement ||
          document.msFullscreenElement
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "msfullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  const handleLogout = () => {
    // Elimina el token de la cookie
    Cookies.remove('authToken');
  };

  const handlesidebar = () => {
    document.body.classList.toggle("mini-sidebar");
    SetToggle((current) => !current);
  };
  const expandMenu = () => {
    document.body.classList.remove("expand-menu");
  };
  const expandMenuOpen = () => {
    document.body.classList.add("expand-menu");
  };
  const sidebarOverlay = () => {
    document?.querySelector(".main-wrapper")?.classList?.toggle("slide-nav");
    document?.querySelector(".sidebar-overlay")?.classList?.toggle("opened");
    document?.querySelector("html")?.classList?.toggle("menu-opened");
  };

  let pathname = location.pathname;

  const exclusionArray = [
    "/reactjs/template/dream-pos/index-three",
    "/reactjs/template/dream-pos/index-one",
  ];
  if (exclusionArray.indexOf(window.location.pathname) >= 0) {
    return "";
  }

  const toggleFullscreen = (elem) => {
    elem = elem || document.documentElement;
    if (
      !document.fullscreenElement &&
      !document.mozFullScreenElement &&
      !document.webkitFullscreenElement &&
      !document.msFullscreenElement
    ) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  return (
    <>
      <div className="header">
        {/* Logo */}
        <div
          className={`header-left ${toggle ? "" : "active"}`}
          onMouseLeave={expandMenu}
          onMouseOver={expandMenuOpen}
        >
          <Link to="/admin-dashboard" className="logo logo-normal">
            <ImageWithBasePath src="assets/img/logo.png" alt="img" />

          </Link>
          <Link to="/admin-dashboard" className="logo logo-white">
            <ImageWithBasePath src="assets/img/logo-white.png" alt="img" />
          </Link>
          <Link to="/admin-dashboard" className="logo-small">
            <ImageWithBasePath src="assets/img/logo1.png" alt="img" />
          </Link>
          <Link
            id="toggle_btn"
            to="#"
            style={{
              display:
                pathname.includes("tasks") || pathname.includes("pos")
                  ? "none"
                  : pathname.includes("compose")
                  ? "none"
                  : "",
            }}
            onClick={handlesidebar}
          >
            <FeatherIcon icon="chevrons-left" className="feather-16" />
          </Link>
        </div>
        {/* /Logo */}
        <Link
          id="mobile_btn"
          className="mobile_btn"
          to="#"
          onClick={sidebarOverlay}
        >
          <span className="bar-icon">
            <span />
            <span />
            <span />
          </span>
        </Link>
        {/* Header Menu */}
        <ul className="nav user-menu">
          {/* Search */}
          <li className="nav-item nav-searchinputs">
            <div className="top-nav-search">
            </div>
          </li>
          {/* /Search */}


 
          {/* /Flag */}
          <li className="nav-item nav-item-box">
            <Link
              to="#"
              id="btnFullscreen"
              onClick={() => toggleFullscreen()}
              className={isFullscreen ? "Exit Fullscreen" : "Go Fullscreen"}
            >
              {/* <i data-feather="maximize" /> */}
              <FeatherIcon icon="maximize" />
            </Link>
          </li>

          {/* Notifications */}
          <li className="nav-item dropdown nav-item-box">
            <Link
              to="#"
              className="dropdown-toggle nav-link"
              data-bs-toggle="dropdown"
            >
              {/* <i data-feather="bell" /> */}
              <FeatherIcon icon="bell" />
              <span className="badge rounded-pill">{notifications.length}</span>
            </Link>
            <div className="dropdown-menu notifications">
              <div className="topnav-dropdown-header">
                <span className="notification-title">Notificaciones</span>
                <Link to="#" className="clear-noti">
                  {" "}
                  Limpiar Todo{" "}
                </Link>
              </div>
              <div className="noti-content">
              <ul className="notification-list">
                {notifications.map((notification) => (
                  <li className="notification-message active" key={notification.id}>
                    <div className="media d-flex">
                      <span className="avatar flex-shrink-0">
                      <ImageWithBasePath alt="img" src={`assets/img/icons/${notification.icon}`} />
                      </span>
                      <div className="media-body flex-grow-1">
                        <p className="noti-details">El usuario:{" "}
                          <span className="noti-title">{notification.user}</span> realizo la accion{" "}
                          <span className="noti-title">{notification.message}</span>
                        </p>
                        <p className="noti-time">
                          <span className="notification-time">{notification.time}</span>
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            </div>
          </li>
          {/* /Notifications */}

          <li className="nav-item dropdown has-arrow main-drop">
            <Link
              to="#"
              className="dropdown-toggle nav-link userset"
              data-bs-toggle="dropdown"
            >
              <span className="user-info">
                <span className="user-letter">
                  <ImageWithBasePath
                    src="assets/img/user/avatar.jpg"
                    alt="img"
                    className="img-fluid"
                  />
                </span>
                <span className="user-detail">
                {user ? (
                  <>
                    <span className="user-name">{`${user.firstName} ${user.lastName}`}</span>
                    <span className="user-role">{user.role}</span>
                  </>
                ) : (
                  <span>Cargando usuario...</span>
                )}
                </span>
              </span>
            </Link>
            <div className="dropdown-menu menu-drop-user">
              <div className="profilename">
                <div className="profileset">
                  <span className="user-img">
                    <ImageWithBasePath
                      src="assets/img/user/avatar.jpg"
                      alt="img"
                    />
                    <span className="status online" />
                  </span>
                  <div className="profilesets">
                  {user ? (
                  <>
                    <span className="user-name">{`${user.firstName} ${user.lastName}`}</span> <br></br>
                    <span className="user-role">{user.role}</span>
                  </>
                ) : (
                  <span>Cargando usuario...</span>
                )}
                  </div>
                </div>
                <hr className="m-0" />
                {/* <Link className="dropdown-item" to={route.profile}>
                  <User className="me-2" /> My Profile
                </Link>
                <Link className="dropdown-item" to={route.generalsettings}>
                  <Settings className="me-2" />
                  Settings
                </Link> */}
                <hr className="m-0" />
                <Link className="dropdown-item logout pb-0" to="/signin" onClick={handleLogout}>
                  <ImageWithBasePath
                    src="assets/img/icons/log-out.svg"
                    alt="img"
                    className="me-2"
                  />
                  Cerrar Sesión
                </Link>
              </div>
            </div>
          </li>
        </ul>
        {/* /Header Menu */}
        {/* Mobile Menu */}
        <div className="dropdown mobile-user-menu">
          <Link
            to="#"
            className="nav-link dropdown-toggle"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            <i className="fa fa-ellipsis-v" />
          </Link>
          <div className="dropdown-menu dropdown-menu-right">
            {/* <Link className="dropdown-item" to="profile">
              My Profile
            </Link>
            <Link className="dropdown-item" to="generalsettings">
              Settings
            </Link> */}
            <Link className="dropdown-item" to="signin" onClick={handleLogout}>
            Cerrar Sesión
          </Link>
          </div>
        </div>
        {/* /Mobile Menu */}
      </div>
    </>
  );
};

export default Header;
