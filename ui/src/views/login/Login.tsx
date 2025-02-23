// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React, {useEffect} from 'react';

// @ts-expect-error TS(2307): Cannot find module '../../assets/city_background.j... Remove this comment to see the full error message
import cityBackground from '../../assets/city_background.jpg';
// @ts-expect-error TS(6142): Module '../../components/logo/Logo' was resolved t... Remove this comment to see the full error message
import Logo from '../../components/logo/Logo';
import {xhrPost} from '../../services/xhr';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import {useHistory} from 'react-router';
import {useDispatch, useSelector} from 'react-redux';
import {Input, Button, Banner} from '@douyinfe/semi-ui';

import './login.less';
import {IconUser, IconLock} from '@douyinfe/semi-icons';

export default function Login() {
    const dispatch = useDispatch();
    const [username, setUserName] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState(null);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    const demoMode = useSelector((state) => state.demoMode.demoMode || false);
    const history = useHistory();

    useEffect(() => {
        async function init() {
            await dispatch.demoMode.getDemoMode();
        }

        init();
    }, []);

    const tryLogin = async () => {
        if (username.length === 0 || password.length === 0) {
            setError('Username and password are mandatory.');
            return;
        }
        try {
            await xhrPost('/api/login', {
                username,
                password,
            });
            setError(null);
        } catch (Exception) {
            setError('Login not successful...');
            return;
        }
        await dispatch.user.getCurrentUser();
        history.push('/jobs');
    };

    return (
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        <div className="login">
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <div className="login__bgImage" style={{background: `url("${cityBackground}")`}}/>
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Logo/>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <form>
                // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                <div className="login__loginWrapper">
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    {error && <Banner type="danger" closeIcon={null} description={error}/>}
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Input
                        size="large"
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        prefix={<IconUser/>}
                        placeholder="Username"
                        value={username}
                        showClear
                        style={{marginTop: error ? '1rem' : '4rem'}}
                        autoFocus
                        onChange={(value: any) => setUserName(value)}
                        onKeyPress={async (e: any) => {
                            if (e.key === 'Enter') {
                                await tryLogin();
                            }
                        }}
                    />

                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Input
                        size="large"
                        mode="password"
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        prefix={<IconLock/>}
                        value={password}
                        placeholder="Password"
                        style={{marginTop: '2rem'}}
                        onChange={(value: any) => setPassword(value)}
                        onKeyPress={async (e: any) => {
                            if (e.key === 'Enter') {
                                await tryLogin();
                            }
                        }}
                    />

                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Button type="primary" onClick={tryLogin} theme="solid" style={{marginTop: '3rem'}}>
                        Login
                    </Button>
                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                    <br/>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    {demoMode && <Banner fullMode={true}
                                         type="info"
                                         bordered
                                         closeIcon={null}
                                         description="This is the demo version of Fredy. Use 'demo' as both the username and password to log in."
                    />}
                // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                </div>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            </form>
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        </div>
    );
}

Login.displayName = 'Login';
