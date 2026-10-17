// Точка входа десктоп-приложения. Логика — в lib.rs (run()).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dn_calc_lib::run()
}
