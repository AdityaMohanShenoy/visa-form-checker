import 'package:shared_preferences/shared_preferences.dart';

class ConnectionStore {
  static const _keyUrl = 'backend_url';
  static const _keyToken = 'auth_token';

  Future<void> save(String url, String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyUrl, url);
    await prefs.setString(_keyToken, token);
  }

  Future<({String? url, String? token})> load() async {
    final prefs = await SharedPreferences.getInstance();
    return (
      url: prefs.getString(_keyUrl),
      token: prefs.getString(_keyToken),
    );
  }

  Future<bool> hasPairing() async {
    final conn = await load();
    return conn.url != null && conn.token != null;
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyUrl);
    await prefs.remove(_keyToken);
  }
}
