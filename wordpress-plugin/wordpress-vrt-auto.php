<?php
/**
 * Plugin Name: WordPress VRT Auto Notifier
 * Description: 完全自動化されたVRT通知システム - 設定不要で即座に動作開始
 * Version: 2.0.0
 * Author: WordPress VRT Team
 * License: MIT
 */

if (!defined('ABSPATH')) {
    exit;
}

class WordPressVrtAuto {
    
    private $webhook_urls = [
        // 複数のWebhook URLを自動検出
        'https://asia-northeast1-{PROJECT_ID}.cloudfunctions.net/wordpressWebhook',
        'https://us-central1-{PROJECT_ID}.cloudfunctions.net/wordpressWebhook'
    ];
    
    public function __construct() {
        // 自動検出とセットアップ
        add_action('init', array($this, 'auto_detect_setup'));
        
        // 更新フック（全パターン網羅）
        add_action('upgrader_process_complete', array($this, 'on_update_complete'), 10, 2);
        add_action('switch_theme', array($this, 'on_theme_switch'));
        add_action('activated_plugin', array($this, 'on_plugin_activated'));
        add_action('deactivated_plugin', array($this, 'on_plugin_deactivated'));
        add_action('wp_update_plugins', array($this, 'on_plugins_update_check'));
        add_action('wp_update_themes', array($this, 'on_themes_update_check'));
        
        // WordPress コア更新
        add_action('_core_updated_successfully', array($this, 'on_core_updated'));
        
        // 設定変更の監視
        add_action('updated_option', array($this, 'on_option_updated'), 10, 3);
        
        // 管理画面
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_notices', array($this, 'admin_notices'));
        
        // AJAX
        add_action('wp_ajax_vrt_test_notification', array($this, 'test_notification'));
        add_action('wp_ajax_vrt_auto_register', array($this, 'auto_register_site'));
        
        // 定期チェック（1日1回）
        add_action('wp', array($this, 'schedule_daily_check'));
        add_action('vrt_daily_check', array($this, 'daily_health_check'));
    }
    
    /**
     * 自動検出とセットアップ
     */
    public function auto_detect_setup() {
        // 初回起動時の自動設定
        if (!get_option('vrt_auto_setup_completed', false)) {
            $this->perform_auto_setup();
        }
        
        // プロジェクトIDの自動検出を試行
        $this->auto_detect_project_id();
    }
    
    /**
     * 自動セットアップ実行
     */
    private function perform_auto_setup() {
        // デフォルト設定
        update_option('vrt_notifications_enabled', true);
        update_option('vrt_auto_mode', true);
        update_option('vrt_debug_logging', true);
        update_option('vrt_monitor_core_updates', true);
        update_option('vrt_monitor_plugin_updates', true);
        update_option('vrt_monitor_theme_updates', true);
        update_option('vrt_monitor_settings_changes', false); // 設定変更は無効
        
        // サイト情報の自動検出
        update_option('vrt_site_info', array(
            'url' => home_url(),
            'name' => get_bloginfo('name'),
            'admin_email' => get_option('admin_email'),
            'wp_version' => get_bloginfo('version'),
            'active_theme' => get_template(),
            'active_plugins' => array_keys(get_option('active_plugins', array())),
            'setup_date' => current_time('mysql'),
            'last_update_check' => current_time('mysql')
        ));
        
        update_option('vrt_auto_setup_completed', true);
        
        // セットアップ完了通知
        $this->send_notification(array(
            'site_url' => home_url(),
            'action' => 'auto_setup_completed',
            'message' => 'WordPress VRT Auto プラグインが自動セットアップを完了しました',
            'site_info' => get_option('vrt_site_info'),
            'timestamp' => current_time('mysql')
        ));
        
        error_log('VRT Auto: セットアップ完了 - ' . home_url());
    }
    
    /**
     * プロジェクトIDの自動検出
     */
    private function auto_detect_project_id() {
        $saved_project_id = get_option('vrt_project_id', '');
        
        if (empty($saved_project_id)) {
            // 一般的なプロジェクトID命名パターンから推測
            $site_domain = parse_url(home_url(), PHP_URL_HOST);
            $clean_domain = preg_replace('/[^a-zA-Z0-9-]/', '-', $site_domain);
            
            $possible_project_ids = array(
                $clean_domain . '-vrt',
                str_replace('.', '-', $site_domain) . '-vrt',
                'wordpress-vrt-' . substr(md5($site_domain), 0, 8),
                'vrt-' . $clean_domain
            );
            
            // 各プロジェクトIDをテスト
            foreach ($possible_project_ids as $project_id) {
                if ($this->test_webhook_connection($project_id)) {
                    update_option('vrt_project_id', $project_id);
                    update_option('vrt_webhook_url', str_replace('{PROJECT_ID}', $project_id, $this->webhook_urls[0]));
                    error_log("VRT Auto: プロジェクトID自動検出成功 - $project_id");
                    break;
                }
            }
        }
    }
    
    /**
     * Webhook接続テスト
     */
    private function test_webhook_connection($project_id) {
        $test_url = str_replace('{PROJECT_ID}', $project_id, $this->webhook_urls[0]);
        
        $response = wp_remote_post($test_url, array(
            'body' => json_encode(array(
                'site_url' => home_url(),
                'action' => 'connection_test',
                'test' => true
            )),
            'headers' => array('Content-Type' => 'application/json'),
            'timeout' => 10,
            'blocking' => true
        ));
        
        return !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
    }
    
    /**
     * プラグイン・テーマ更新完了
     */
    public function on_update_complete($upgrader_object, $options) {
        $update_info = array(
            'site_url' => home_url(),
            'action' => 'update_complete',
            'timestamp' => current_time('mysql'),
            'update_type' => $options['type'] ?? 'unknown',
            'wp_version' => get_bloginfo('version')
        );
        
        if ($options['type'] === 'plugin') {
            $update_info['plugin_info'] = array(
                'plugins' => $options['plugins'] ?? array(),
                'action' => $options['action'] ?? 'unknown',
                'active_plugins' => array_keys(get_option('active_plugins', array()))
            );
        }
        
        if ($options['type'] === 'theme') {
            $update_info['theme_info'] = array(
                'themes' => $options['themes'] ?? array(),
                'action' => $options['action'] ?? 'unknown',
                'active_theme' => get_template()
            );
        }
        
        $this->send_notification($update_info);
        $this->log_update_history($update_info);
    }
    
    /**
     * WordPress コア更新
     */
    public function on_core_updated($wp_version) {
        $update_info = array(
            'site_url' => home_url(),
            'action' => 'core_updated',
            'timestamp' => current_time('mysql'),
            'core_info' => array(
                'new_version' => $wp_version,
                'previous_version' => get_option('vrt_previous_wp_version', ''),
            )
        );
        
        update_option('vrt_previous_wp_version', $wp_version);
        
        $this->send_notification($update_info);
        $this->log_update_history($update_info);
    }
    
    /**
     * プラグイン有効化
     */
    public function on_plugin_activated($plugin) {
        $update_info = array(
            'site_url' => home_url(),
            'action' => 'plugin_activated',
            'timestamp' => current_time('mysql'),
            'plugin_info' => array(
                'activated_plugin' => $plugin,
                'plugin_data' => get_plugin_data(WP_PLUGIN_DIR . '/' . $plugin)
            )
        );
        
        $this->send_notification($update_info);
    }
    
    /**
     * 設定変更監視
     */
    public function on_option_updated($option, $old_value, $value) {
        // 重要な設定のみ監視
        $monitored_options = array(
            'active_plugins',
            'template',
            'stylesheet', 
            'blogname',
            'home',
            'siteurl'
        );
        
        if (in_array($option, $monitored_options) && get_option('vrt_monitor_settings_changes', false)) {
            $update_info = array(
                'site_url' => home_url(),
                'action' => 'setting_changed',
                'timestamp' => current_time('mysql'),
                'setting_info' => array(
                    'option_name' => $option,
                    'old_value' => $old_value,
                    'new_value' => $value
                )
            );
            
            $this->send_notification($update_info);
        }
    }
    
    /**
     * 通知送信（自動フォールバック付き）
     */
    private function send_notification($data) {
        if (!get_option('vrt_notifications_enabled', true)) {
            return;
        }
        
        $webhook_url = get_option('vrt_webhook_url', '');
        
        // URLが設定されていない場合は自動検出を試行
        if (empty($webhook_url)) {
            $project_id = get_option('vrt_project_id', '');
            if (!empty($project_id)) {
                $webhook_url = str_replace('{PROJECT_ID}', $project_id, $this->webhook_urls[0]);
            }
        }
        
        if (empty($webhook_url)) {
            error_log('VRT Auto: Webhook URL が設定されていません');
            return;
        }
        
        $args = array(
            'body' => json_encode($data),
            'headers' => array(
                'Content-Type' => 'application/json',
                'User-Agent' => 'WordPress-VRT-Auto/2.0'
            ),
            'timeout' => 30,
            'blocking' => false
        );
        
        $response = wp_remote_post($webhook_url, $args);
        
        // ログ記録
        if (get_option('vrt_debug_logging', true)) {
            if (is_wp_error($response)) {
                error_log('VRT Auto通知エラー: ' . $response->get_error_message());
            } else {
                error_log('VRT Auto通知送信: ' . $data['action'] . ' - ' . home_url());
            }
        }
        
        // 通知履歴保存
        $this->save_notification_history($data, $response);
    }
    
    /**
     * 更新履歴を保存
     */
    private function log_update_history($update_info) {
        $history = get_option('vrt_update_history', array());
        
        // 最新50件のみ保持
        if (count($history) >= 50) {
            $history = array_slice($history, -49);
        }
        
        $history[] = $update_info;
        update_option('vrt_update_history', $history);
    }
    
    /**
     * 通知履歴を保存
     */
    private function save_notification_history($data, $response) {
        $history = get_option('vrt_notification_history', array());
        
        $log_entry = array(
            'timestamp' => current_time('mysql'),
            'action' => $data['action'],
            'success' => !is_wp_error($response),
            'response_code' => is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response),
            'error' => is_wp_error($response) ? $response->get_error_message() : null
        );
        
        // 最新20件のみ保持
        if (count($history) >= 20) {
            $history = array_slice($history, -19);
        }
        
        $history[] = $log_entry;
        update_option('vrt_notification_history', $history);
    }
    
    /**
     * 定期チェックのスケジュール
     */
    public function schedule_daily_check() {
        if (!wp_next_scheduled('vrt_daily_check')) {
            wp_schedule_event(time(), 'daily', 'vrt_daily_check');
        }
    }
    
    /**
     * 日次ヘルスチェック
     */
    public function daily_health_check() {
        // システム情報を更新
        $site_info = get_option('vrt_site_info', array());
        $site_info['last_health_check'] = current_time('mysql');
        $site_info['wp_version'] = get_bloginfo('version');
        $site_info['active_theme'] = get_template();
        $site_info['active_plugins'] = array_keys(get_option('active_plugins', array()));
        update_option('vrt_site_info', $site_info);
        
        // ヘルスチェック通知（週1回のみ）
        $last_health_notification = get_option('vrt_last_health_notification', 0);
        if (time() - $last_health_notification > 7 * 24 * 60 * 60) { // 7日
            $this->send_notification(array(
                'site_url' => home_url(),
                'action' => 'health_check',
                'timestamp' => current_time('mysql'),
                'site_info' => $site_info,
                'notification_history' => array_slice(get_option('vrt_notification_history', array()), -5)
            ));
            
            update_option('vrt_last_health_notification', time());
        }
    }
    
    /**
     * 管理画面メニュー
     */
    public function add_admin_menu() {
        add_options_page(
            'VRT Auto Settings',
            'VRT Auto',
            'manage_options',
            'vrt-auto',
            array($this, 'admin_page')
        );
    }
    
    /**
     * 管理画面通知
     */
    public function admin_notices() {
        if (!get_option('vrt_auto_setup_completed', false)) {
            echo '<div class="notice notice-info"><p><strong>VRT Auto:</strong> 自動セットアップ中です...</p></div>';
        } elseif (get_option('vrt_notifications_enabled', true)) {
            $project_id = get_option('vrt_project_id', '');
            if (empty($project_id)) {
                echo '<div class="notice notice-warning"><p><strong>VRT Auto:</strong> プロジェクトIDが自動検出できませんでした。手動で設定してください。</p></div>';
            }
        }
    }
    
    /**
     * 管理画面ページ
     */
    public function admin_page() {
        $site_info = get_option('vrt_site_info', array());
        $update_history = array_slice(get_option('vrt_update_history', array()), -10);
        $notification_history = array_slice(get_option('vrt_notification_history', array()), -10);
        ?>
        <div class="wrap">
            <h1>🤖 WordPress VRT Auto Settings</h1>
            
            <div class="notice notice-success">
                <p><strong>✨ 完全自動化モード:</strong> このプラグインは設定不要で自動的に動作します！</p>
            </div>
            
            <div class="postbox" style="margin-top: 20px;">
                <h2 class="hndle">📊 サイト情報</h2>
                <div class="inside">
                    <table class="form-table">
                        <tr><th>サイト名</th><td><?php echo esc_html($site_info['name'] ?? get_bloginfo('name')); ?></td></tr>
                        <tr><th>URL</th><td><?php echo esc_html($site_info['url'] ?? home_url()); ?></td></tr>
                        <tr><th>WordPress バージョン</th><td><?php echo esc_html(get_bloginfo('version')); ?></td></tr>
                        <tr><th>アクティブテーマ</th><td><?php echo esc_html(get_template()); ?></td></tr>
                        <tr><th>プロジェクトID</th><td><?php echo esc_html(get_option('vrt_project_id', '自動検出中...')); ?></td></tr>
                        <tr><th>最終ヘルスチェック</th><td><?php echo esc_html($site_info['last_health_check'] ?? '未実行'); ?></td></tr>
                    </table>
                </div>
            </div>
            
            <div class="postbox">
                <h2 class="hndle">🔔 最近の通知履歴</h2>
                <div class="inside">
                    <?php if (empty($notification_history)): ?>
                        <p>通知履歴はありません</p>
                    <?php else: ?>
                        <table class="wp-list-table widefat">
                            <thead>
                                <tr><th>日時</th><th>アクション</th><th>ステータス</th></tr>
                            </thead>
                            <tbody>
                                <?php foreach (array_reverse($notification_history) as $log): ?>
                                <tr>
                                    <td><?php echo esc_html($log['timestamp']); ?></td>
                                    <td><?php echo esc_html($log['action']); ?></td>
                                    <td><?php echo $log['success'] ? '✅ 成功' : '❌ 失敗'; ?></td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </div>
            </div>
            
            <div class="postbox">
                <h2 class="hndle">🔧 テスト機能</h2>
                <div class="inside">
                    <p>VRTシステムとの接続をテストできます：</p>
                    <button type="button" class="button button-primary" onclick="sendTestNotification()">🧪 テスト通知送信</button>
                    <button type="button" class="button" onclick="autoRegisterSite()">📝 サイト自動登録</button>
                    <div id="test-result" style="margin-top: 10px;"></div>
                </div>
            </div>
        </div>
        
        <script>
        function sendTestNotification() {
            const button = event.target;
            const resultDiv = document.getElementById('test-result');
            
            button.disabled = true;
            button.textContent = '送信中...';
            
            fetch(ajaxurl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=vrt_test_notification&nonce=<?php echo wp_create_nonce('vrt_test'); ?>'
            })
            .then(response => response.json())
            .then(data => {
                resultDiv.innerHTML = data.success ? 
                    '<div class="notice notice-success inline"><p>✅ テスト通知を送信しました</p></div>' :
                    '<div class="notice notice-error inline"><p>❌ 送信失敗: ' + data.data + '</p></div>';
            })
            .finally(() => {
                button.disabled = false;
                button.textContent = '🧪 テスト通知送信';
            });
        }
        
        function autoRegisterSite() {
            const button = event.target;
            const resultDiv = document.getElementById('test-result');
            
            button.disabled = true;
            button.textContent = '登録中...';
            
            fetch(ajaxurl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=vrt_auto_register&nonce=<?php echo wp_create_nonce('vrt_register'); ?>'
            })
            .then(response => response.json())
            .then(data => {
                resultDiv.innerHTML = data.success ? 
                    '<div class="notice notice-success inline"><p>✅ サイトの自動登録を要求しました</p></div>' :
                    '<div class="notice notice-error inline"><p>❌ 登録失敗: ' + data.data + '</p></div>';
            })
            .finally(() => {
                button.disabled = false;
                button.textContent = '📝 サイト自動登録';
            });
        }
        </script>
        <?php
    }
    
    /**
     * AJAX: テスト通知
     */
    public function test_notification() {
        check_ajax_referer('vrt_test', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('権限がありません');
        }
        
        $this->send_notification(array(
            'site_url' => home_url(),
            'action' => 'test_notification',
            'timestamp' => current_time('mysql'),
            'message' => 'VRT Auto プラグインからのテスト通知です',
            'test' => true
        ));
        
        wp_send_json_success('テスト通知を送信しました');
    }
    
    /**
     * AJAX: サイト自動登録
     */
    public function auto_register_site() {
        check_ajax_referer('vrt_register', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('権限がありません');
        }
        
        $site_info = get_option('vrt_site_info', array());
        
        $this->send_notification(array(
            'site_url' => home_url(),
            'action' => 'auto_register_request',
            'timestamp' => current_time('mysql'),
            'site_info' => $site_info,
            'auto_register' => true
        ));
        
        wp_send_json_success('サイトの自動登録要求を送信しました');
    }
}

// プラグイン開始
new WordPressVrtAuto();

// プラグイン有効化時
register_activation_hook(__FILE__, function() {
    // 既存の設定をクリア（クリーンスタート）
    delete_option('vrt_auto_setup_completed');
    
    error_log('VRT Auto プラグインが有効化されました - ' . home_url());
});

// プラグイン無効化時
register_deactivation_hook(__FILE__, function() {
    wp_clear_scheduled_hook('vrt_daily_check');
    error_log('VRT Auto プラグインが無効化されました - ' . home_url());
});
?>